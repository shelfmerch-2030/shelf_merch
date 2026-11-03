import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { uploadFile } from '../../services/storage.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { McpWalletDocumentTicket } from './mcpWalletDocumentTicket.model.js';
import { loadMcpActor } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));
const TICKET_TTL_MS = 15 * 60 * 1000;

let indexesReady;

async function ensureIndexes() {
  indexesReady ??= McpWalletDocumentTicket.syncIndexes();
  return indexesReady;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokenMatches(storedHash, uploadToken) {
  const expected = Buffer.from(String(storedHash || ''), 'hex');
  const actual = Buffer.from(sha256(uploadToken), 'hex');
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function apiBase() {
  return (env.BASE_URL || env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
}

function assertWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Wallet document upload requires a company admin');
  }
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Wallet document upload is not available for this account');
  }
  return caller;
}

export const WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION = [
  'Create a short-lived authenticated upload ticket for a purchase-order or agreement PDF.',
  'MCP clients cannot attach binary files to tools. POST the file to uploadUrl with header X-Mcp-Upload-Token.',
  'Then call wallets_get_document_upload and pass documentUrl into wallets_prepare_setup.',
  'Company admins only. Does not create or fund a wallet.',
].join(' ');

export const WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION = [
  'Poll a wallets_prepare_document_upload ticket until the PO/agreement is stored.',
  'Returns documentUrl for wallets_prepare_setup when status is ready.',
].join(' ');

export const walletsPrepareDocumentUploadInputSchema = z.object({
  originalName: z.string().trim().min(1).max(200).optional(),
}).strict();

export const walletsPrepareDocumentUploadOutputSchema = z.object({
  ticketId: z.string(),
  uploadUrl: z.string(),
  uploadToken: z.string(),
  expiresAt: z.string(),
  instructions: z.string(),
});

export const walletsGetDocumentUploadInputSchema = z.object({
  ticketId: z.string().trim().min(8).max(80),
}).strict();

export const walletsGetDocumentUploadOutputSchema = z.object({
  ticketId: z.string(),
  status: z.enum(['pending', 'ready', 'expired', 'consumed']),
  documentUrl: z.string().optional(),
  mimeType: z.string().optional(),
  originalName: z.string().optional(),
  expiresAt: z.string(),
});

export async function prepareWalletDocumentUpload({ tenantId, actorUserId, input = {} }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const ticketId = randomBytes(16).toString('hex');
  const uploadToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  await McpWalletDocumentTicket.create({
    tenantId,
    ticketId,
    tokenHash: sha256(uploadToken),
    userId: actorUserId,
    status: 'pending',
    originalName: input.originalName || '',
    expiresAt,
  });
  const uploadUrl = `${apiBase()}/api/v1/mcp/wallet-documents/${ticketId}`;
  return {
    ticketId,
    uploadUrl,
    uploadToken,
    expiresAt: expiresAt.toISOString(),
    instructions: [
      `POST multipart field "document" to ${uploadUrl}`,
      'Include header X-Mcp-Upload-Token with the uploadToken from this response.',
      'Allowed types: PDF (application/pdf). Max 25 MB.',
      'Then call wallets_get_document_upload with this ticketId.',
    ].join(' '),
  };
}

export async function getWalletDocumentUpload({ tenantId, actorUserId, ticketId }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const ticket = await McpWalletDocumentTicket.findOne({ tenantId, ticketId, userId: actorUserId });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (ticket.status === 'pending' && ticket.expiresAt <= new Date()) {
    ticket.status = 'expired';
    await ticket.save();
  }
  return {
    ticketId: ticket.ticketId,
    status: ticket.status,
    documentUrl: ticket.documentUrl || undefined,
    mimeType: ticket.mimeType || undefined,
    originalName: ticket.originalName || undefined,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  };
}

export async function completeWalletDocumentUpload({ ticketId, uploadToken, file }) {
  await ensureIndexes();
  if (!uploadToken) throw new ApiError(401, 'Upload token required', 'UNAUTHORIZED');
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  const ticket = await McpWalletDocumentTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (!tokenMatches(ticket.tokenHash, uploadToken)) {
    throw new ApiError(401, 'Upload token is invalid', 'UNAUTHORIZED');
  }
  if (ticket.expiresAt <= new Date()) {
    ticket.status = 'expired';
    await ticket.save();
    throw new ApiError(410, 'Upload ticket has expired', 'CONFIRMATION_EXPIRED');
  }
  if (ticket.status === 'consumed') {
    throw new ApiError(409, 'Upload ticket was already used', 'CONFIRMATION_REUSED');
  }
  if (ticket.status === 'ready' && ticket.documentUrl) {
    return {
      ticketId: ticket.ticketId,
      status: ticket.status,
      documentUrl: ticket.documentUrl,
      mimeType: ticket.mimeType,
      originalName: ticket.originalName,
      expiresAt: new Date(ticket.expiresAt).toISOString(),
    };
  }
  const { url } = await uploadFile({ tenantId: ticket.tenantId, kind: 'document', file });
  ticket.status = 'ready';
  ticket.documentUrl = url;
  ticket.mimeType = file.mimetype || '';
  ticket.originalName = file.originalname || ticket.originalName || '';
  await ticket.save();
  return {
    ticketId: ticket.ticketId,
    status: ticket.status,
    documentUrl: ticket.documentUrl,
    mimeType: ticket.mimeType,
    originalName: ticket.originalName,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  };
}

/** Resolve and optionally consume a ready document URL for wallet setup. */
export async function resolveSetupDocumentUrl({
  tenantId,
  actorUserId,
  documentUrl,
  documentTicketId,
  consume = false,
}) {
  if (documentTicketId) {
    const ticket = await McpWalletDocumentTicket.findOne({
      tenantId,
      ticketId: documentTicketId,
      userId: actorUserId,
    });
    if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
    if (ticket.expiresAt <= new Date() && ticket.status !== 'ready' && ticket.status !== 'consumed') {
      ticket.status = 'expired';
      await ticket.save();
      throw new ApiError(410, 'Upload ticket has expired', 'CONFIRMATION_EXPIRED');
    }
    if (ticket.status !== 'ready' && ticket.status !== 'consumed') {
      throw new ApiError(422, 'Purchase order document is not ready', 'DOCUMENT_REQUIRED');
    }
    if (!ticket.documentUrl) {
      throw new ApiError(422, 'Purchase order document is not ready', 'DOCUMENT_REQUIRED');
    }
    if (documentUrl && documentUrl !== ticket.documentUrl) {
      throw new ApiError(400, 'Document reference does not match the upload ticket', 'INVALID_DOCUMENT_URL');
    }
    if (consume && ticket.status === 'ready') {
      ticket.status = 'consumed';
      await ticket.save();
    }
    return ticket.documentUrl;
  }
  if (!documentUrl) {
    throw new ApiError(422, 'Purchase order document reference is required', 'DOCUMENT_REQUIRED');
  }
  return documentUrl;
}

export async function prepareWalletDocumentUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletDocumentUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function getWalletDocumentUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  const parsed = walletsGetDocumentUploadInputSchema.safeParse(args || {});
  if (!parsed.success) throw new ApiError(400, 'Upload ticket id is not valid', 'VALIDATION');
  return getWalletDocumentUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    ticketId: parsed.data.ticketId,
  });
}

export function walletsDocumentUploadText(output, heading) {
  if (output.uploadUrl) {
    return [heading, `Upload to ${output.uploadUrl}`, `Expires ${output.expiresAt}`].join('\n');
  }
  return [heading, `Status ${output.status}`, output.documentUrl || 'Waiting for upload.'].join('\n');
}

export function walletsDocumentUploadError(error, fallback) {
  const map = {
    FORBIDDEN: 'You cannot upload wallet funding documents.',
    NOT_FOUND: 'That upload ticket was not found.',
    VALIDATION: 'Upload details are not valid.',
    UNAUTHORIZED: 'Upload authentication failed.',
    FILE_REQUIRED: 'A document file is required.',
    UNSUPPORTED_FILE_TYPE: 'Only PDF documents are accepted for wallet funding.',
    CONFIRMATION_EXPIRED: 'This upload ticket has expired.',
    CONFIRMATION_REUSED: 'This upload ticket was already used.',
    DOCUMENT_REQUIRED: 'Upload the purchase order before continuing.',
    INVALID_DOCUMENT_URL: 'That document reference is not valid.',
    ACTOR_INACTIVE: 'This account cannot upload documents.',
    TENANT_INACTIVE: 'This workspace cannot upload documents.',
  };
  return map[error?.code] || fallback;
}
