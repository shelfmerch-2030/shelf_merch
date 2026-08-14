import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const processEnv = { ...process.env };
if (processEnv.MONGO_URL && !processEnv.MONGODB_URI) {
  processEnv.MONGODB_URI = processEnv.MONGO_URL;
}

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const requiredSecret = (devDefault) =>
  isProd ? z.string().min(16) : z.string().min(1).default(devDefault);

const mongoUriSchema = isTest
  ? z.string().optional().default('')
  : z.string().min(1, 'Set MONGO_URL or MONGODB_URI to your MongoDB Atlas connection string');

const ZOHO_CALLBACK_PATH = '/api/integrations/zoho/callback';
const SLACK_CALLBACK_PATH = '/api/integrations/slack/callback';

/**
 * Validate ZOHO_REDIRECT_URI shape. Must be an absolute URL whose pathname is
 * exactly /api/integrations/zoho/callback (no trailing slash).
 */
export function validateZohoRedirectUri(raw) {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, message: 'ZOHO_REDIRECT_URI is required when Zoho is enabled' };
  }
  if (raw.endsWith('/')) {
    return {
      ok: false,
      message:
        'ZOHO_REDIRECT_URI must not end with a trailing slash ' +
        '(expected ...' + ZOHO_CALLBACK_PATH + ')',
    };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(raw);
  } catch {
    return { ok: false, message: 'ZOHO_REDIRECT_URI must be a valid absolute URL' };
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, message: 'ZOHO_REDIRECT_URI must use http or https' };
  }
  if (parsedUrl.pathname !== ZOHO_CALLBACK_PATH) {
    return {
      ok: false,
      message: 'ZOHO_REDIRECT_URI pathname must be exactly ' + ZOHO_CALLBACK_PATH,
    };
  }
  if (parsedUrl.search || parsedUrl.hash) {
    return { ok: false, message: 'ZOHO_REDIRECT_URI must not include query or hash' };
  }
  return { ok: true, value: raw };
}

/**
 * Validate SLACK_REDIRECT_URI shape when explicitly set.
 * Pathname must be exactly /api/integrations/slack/callback.
 */
export function validateSlackRedirectUri(raw) {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, message: 'SLACK_REDIRECT_URI is required when Slack is enabled' };
  }
  if (raw.endsWith('/')) {
    return {
      ok: false,
      message:
        'SLACK_REDIRECT_URI must not end with a trailing slash ' +
        '(expected ...' +
        SLACK_CALLBACK_PATH +
        ')',
    };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(raw);
  } catch {
    return { ok: false, message: 'SLACK_REDIRECT_URI must be a valid absolute URL' };
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, message: 'SLACK_REDIRECT_URI must use http or https' };
  }
  if (parsedUrl.pathname !== SLACK_CALLBACK_PATH) {
    return {
      ok: false,
      message: 'SLACK_REDIRECT_URI pathname must be exactly ' + SLACK_CALLBACK_PATH,
    };
  }
  if (parsedUrl.search || parsedUrl.hash) {
    return { ok: false, message: 'SLACK_REDIRECT_URI must not include query or hash' };
  }
  return { ok: true, value: raw };
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(isProd ? 8080 : 3001),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  MONGODB_URI: mongoUriSchema,
  REDIS_URL: z.string().default('redis://localhost:6379'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_DSN: z.string().optional().default(''),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(''),

  JWT_ACCESS_SECRET: requiredSecret('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: requiredSecret('dev-refresh-secret-change-me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  R2_ENDPOINT: z.string().optional().default(''),
  R2_ACCESS_KEY: z.string().optional().default(''),
  R2_SECRET_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default('shelfmerch-assets'),

  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_REGION: z.string().optional().default(''),
  S3_BUCKET_NAME: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['auto', 'local', 's3', 'r2']).default('auto'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  MSG91_AUTH_KEY: z.string().optional().default(''),
  MSG91_SENDER_ID: z.string().optional().default('SLFMRH'),
  MSG91_OTP_TEMPLATE_ID: z.string().optional().default(''),

  EMAIL_PROVIDER_API_KEY: z.string().optional().default(''),
  EMAIL_SERVICE: z.string().optional().default('gmail'),
  EMAIL_USER: z.string().optional().default(''),
  EMAIL_PASSWORD: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default(''),
  APP_URL: z.string().optional().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().optional().default(''),
  CSP_MODE: z.enum(['enforce', 'report-only', 'off']).default('report-only'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),
  BASE_URL: z.string().optional().default(''),
  CLIENT_URL: z.string().optional().default(''),

  ZOHO_CLIENT_ID: z.string().optional().default(''),
  ZOHO_CLIENT_SECRET: z.string().optional().default(''),
  ZOHO_REDIRECT_URI: z.string().optional().default(''),
  ZOHO_ACCOUNTS_URL: z.string().optional().default('https://accounts.zoho.in'),
  TOKEN_ENCRYPTION_KEY: isProd
    ? z.string().optional().default('')
    : z.string().optional().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  /** Merge.dev test/production API key — server-only; never expose to the frontend. */
  MERGE_API_KEY: z.string().optional().default(''),

  /** Slack OAuth (server-only) — Client Secret never exposed to the frontend. */
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  /**
   * Absolute OAuth redirect URI. Local default via APP_URL when empty:
   * http://localhost:8080/api/integrations/slack/callback
   * Production: https://shelfmerch.io/api/integrations/slack/callback
   */
  SLACK_REDIRECT_URI: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(processEnv);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => '  - ' + i.path.join('.') + ': ' + i.message)
    .join('\n');
  console.error('Invalid environment configuration:\n' + issues);
  process.exit(1);
}

export const env = parsed.data;

const zohoPartial =
  Boolean(env.ZOHO_CLIENT_ID) ||
  Boolean(env.ZOHO_CLIENT_SECRET) ||
  Boolean(env.ZOHO_REDIRECT_URI);
if (zohoPartial) {
  const missing = [];
  if (!env.ZOHO_CLIENT_ID) missing.push('ZOHO_CLIENT_ID');
  if (!env.ZOHO_CLIENT_SECRET) missing.push('ZOHO_CLIENT_SECRET');
  if (!env.ZOHO_REDIRECT_URI) missing.push('ZOHO_REDIRECT_URI');
  if (!env.TOKEN_ENCRYPTION_KEY) missing.push('TOKEN_ENCRYPTION_KEY');
  if (!env.ZOHO_ACCOUNTS_URL) missing.push('ZOHO_ACCOUNTS_URL');
  if (missing.length) {
    console.error(
      'Invalid Zoho People configuration — set all of: ' + missing.join(', ') +
        ' (or leave all Zoho vars empty to disable the integration).',
    );
    process.exit(1);
  }
  const redirectCheck = validateZohoRedirectUri(env.ZOHO_REDIRECT_URI);
  if (!redirectCheck.ok) {
    console.error('Invalid Zoho People configuration:\n  - ZOHO_REDIRECT_URI: ' + redirectCheck.message);
    process.exit(1);
  }
}

const slackPartial =
  Boolean(env.SLACK_CLIENT_ID) ||
  Boolean(env.SLACK_CLIENT_SECRET) ||
  Boolean(env.SLACK_REDIRECT_URI);
if (slackPartial) {
  const missing = [];
  if (!env.SLACK_CLIENT_ID) missing.push('SLACK_CLIENT_ID');
  if (!env.SLACK_CLIENT_SECRET) missing.push('SLACK_CLIENT_SECRET');
  if (!env.TOKEN_ENCRYPTION_KEY) missing.push('TOKEN_ENCRYPTION_KEY');
  if (missing.length) {
    console.error(
      'Invalid Slack configuration — set all of: ' +
        missing.join(', ') +
        ' (or leave all Slack vars empty to disable the integration).',
    );
    process.exit(1);
  }
  if (env.SLACK_REDIRECT_URI) {
    const redirectCheck = validateSlackRedirectUri(env.SLACK_REDIRECT_URI);
    if (!redirectCheck.ok) {
      console.error('Invalid Slack configuration:\n  - SLACK_REDIRECT_URI: ' + redirectCheck.message);
      process.exit(1);
    }
  }
}

export const corsOrigins = () =>
  env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export const razorpayConfigured = () =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const razorpayWebhookConfigured = () => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

export const msg91Configured = () =>
  Boolean(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID);

/** Never open real SMTP in the Vitest suite (root .env often has credentials). */
export const emailConfigured = () =>
  !isTest && Boolean(env.EMAIL_USER && env.EMAIL_PASSWORD);

export const googleAuthConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const googleCallbackUrl = () => {
  if (env.GOOGLE_CALLBACK_URL) return env.GOOGLE_CALLBACK_URL.replace(/\/$/, '');
  const base = (env.BASE_URL || env.APP_URL).replace(/\/$/, '');
  return base + '/api/v1/auth/google/callback';
};

export const googleClientUrl = () => {
  if (env.CLIENT_URL) return env.CLIENT_URL.replace(/\/$/, '');
  const base = (env.BASE_URL || env.APP_URL).replace(/\/$/, '');
  return base + '/auth/google';
};

export const zohoPeopleConfigured = () =>
  Boolean(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REDIRECT_URI && env.TOKEN_ENCRYPTION_KEY);

export const mergeConfigured = () => Boolean(env.MERGE_API_KEY);

export const slackConfigured = () =>
  Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);

/** Prefer explicit SLACK_REDIRECT_URI; otherwise derive from BASE_URL / APP_URL. */
export const slackRedirectUri = () => {
  if (env.SLACK_REDIRECT_URI) {
    const result = validateSlackRedirectUri(env.SLACK_REDIRECT_URI);
    if (!result.ok) throw new Error(result.message);
    return result.value;
  }
  const base = (env.BASE_URL || env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
  return `${base}${SLACK_CALLBACK_PATH}`;
};

export const zohoAccountsUrl = () =>
  (env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '');

export const zohoRedirectUri = () => {
  const result = validateZohoRedirectUri(env.ZOHO_REDIRECT_URI);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.value;
};

export const zohoIntegrationsClientPath = () => '/dashboard/integrations';

export const s3Configured = () =>
  Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION && env.S3_BUCKET_NAME);
