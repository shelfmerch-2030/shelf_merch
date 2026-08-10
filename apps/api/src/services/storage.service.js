import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env, s3Configured } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

const ALLOWED_TYPES = {
  artwork: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  logo: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'],
  product: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'],
  mockup: ['image/png', 'image/jpeg', 'image/webp'],
  production: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  // Support-ticket attachments: images + PDF only. Deliberately no SVG — the
  // multer layer blocks it too, this is defense in depth against stored XSS.
  attachment: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'],
};

const r2Configured = () => Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY && env.R2_SECRET_KEY);

let r2Client = null;
async function getR2() {
  if (!r2Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: { accessKeyId: env.R2_ACCESS_KEY, secretAccessKey: env.R2_SECRET_KEY },
    });
  }
  return r2Client;
}

let s3Client = null;
async function getS3() {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/** Public URL for an S3 object key (path-style when bucket name contains dots). */
function s3PublicUrl(key) {
  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  const bucket = env.S3_BUCKET_NAME;
  const region = env.AWS_REGION;
  if (bucket.includes('.')) {
    return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function mapS3Error(err) {
  const code = err?.name ?? err?.Code;
  if (code === 'AccessDenied') {
    throw new ApiError(
      403,
      `S3 upload denied for bucket "${env.S3_BUCKET_NAME}": IAM user needs s3:PutObject on arn:aws:s3:::${env.S3_BUCKET_NAME}/*. Set STORAGE_DRIVER=local in .env to use disk uploads until IAM is fixed.`,
      'S3_ACCESS_DENIED',
    );
  }
  if (code === 'NoSuchBucket') {
    throw new ApiError(404, `S3 bucket "${env.S3_BUCKET_NAME}" does not exist`, 'S3_NO_BUCKET');
  }
  if (code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') {
    throw new ApiError(401, 'Invalid AWS credentials', 'S3_AUTH_FAILED');
  }
  throw err;
}

function useR2() {
  if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') return false;
  return env.STORAGE_DRIVER === 'r2' || (env.STORAGE_DRIVER === 'auto' && r2Configured());
}

function useS3() {
  if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 'r2') return false;
  return env.STORAGE_DRIVER === 's3' || (env.STORAGE_DRIVER === 'auto' && s3Configured());
}

async function uploadLocal(key, buffer) {
  const target = path.join(LOCAL_UPLOAD_DIR, key.replaceAll('/', path.sep));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return { key, url: `/uploads/${key}` };
}

export function validateUpload(file, kind) {
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  if (!ALLOWED_TYPES[kind]?.includes(file.mimetype)) {
    throw new ApiError(
      415,
      `Unsupported file type "${file.mimetype}" for ${kind}. Allowed: ${ALLOWED_TYPES[kind].join(', ')}`,
      'UNSUPPORTED_FILE_TYPE',
    );
  }
}

/**
 * §9.2 — Cloud storage when configured (R2 or AWS S3); local disk fallback for dev.
 * Returns a URL usable by the frontend.
 */
export async function uploadFile({ tenantId, kind, file }) {
  validateUpload(file, kind);
  const ext = path.extname(file.originalname) || '';
  const key = `${tenantId}/${kind}/${crypto.randomBytes(12).toString('hex')}${ext}`;

  if (env.STORAGE_DRIVER === 'local') {
    return uploadLocal(key, file.buffer);
  }

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  if (useR2()) {
    const client = await getR2();
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return { key, url: `${env.R2_ENDPOINT}/${env.R2_BUCKET}/${key}` };
  }

  if (useS3()) {
    try {
      const client = await getS3();
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return { key, url: s3PublicUrl(key) };
    } catch (err) {
      mapS3Error(err);
    }
  }

  return uploadLocal(key, file.buffer);
}

/** Upload a raw buffer (e.g. generated PDF) to configured storage. */
export async function uploadBuffer({
  tenantId,
  kind,
  buffer,
  filename,
  contentType = 'application/pdf',
}) {
  const ext = path.extname(filename) || '.pdf';
  const key = `${tenantId}/${kind}/${crypto.randomBytes(12).toString('hex')}${ext}`;

  if (env.STORAGE_DRIVER === 'local') {
    return uploadLocal(key, buffer);
  }

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  if (useR2()) {
    const client = await getR2();
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return { key, url: `${env.R2_ENDPOINT}/${env.R2_BUCKET}/${key}` };
  }

  if (useS3()) {
    try {
      const client = await getS3();
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return { key, url: s3PublicUrl(key) };
    } catch (err) {
      mapS3Error(err);
    }
  }

  return uploadLocal(key, buffer);
}

export { LOCAL_UPLOAD_DIR };
