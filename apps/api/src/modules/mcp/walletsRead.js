import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { TRANSACTION_TYPES } from '../wallets/walletTransaction.model.js';
import { listWalletBalancesRead, listWalletTransactionsRead } from '../wallets/wallets.service.js';

export const WALLET_BALANCES_DESCRIPTION = [
  'List ShelfMerch wallet balances for the signed-in workspace.',
  'Company admins and entity managers both see every wallet in the workspace.',
  'unallocatedAmount is balance minus allocatedAmount, in the wallet currency.',
  'Funding documents, tax ids, contact details, and owner ids are not returned.',
].join(' ');

export const WALLET_TRANSACTIONS_DESCRIPTION = [
  'List ledger transactions for one ShelfMerch wallet in the signed-in workspace.',
  'availableAfter is the cash balance after the transaction minus allocations still outstanding.',
  'The actor, description, and related entity are not returned.',
].join(' ');

const walletBalanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  status: z.string(),
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
});

export const walletBalancesInputSchema = z.object({});

export const walletBalancesOutputSchema = z.object({
  items: z.array(walletBalanceSchema),
});

export const walletTransactionsInputSchema = z.object({
  walletId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'walletId must be a wallet id')
    .describe('Wallet id from wallet_list_balances.'),
  type: z.enum(TRANSACTION_TYPES).optional().describe('Ledger transaction type. Omitted types are not filtered.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

const walletTransactionSchema = z.object({
  type: z.string(),
  amount: z.number(),
  balanceAfter: z.number(),
  availableAfter: z.number(),
  createdAt: z.string(),
});

export const walletTransactionsOutputSchema = z.object({
  items: z.array(walletTransactionSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export function walletReaderFromContext(ctx) {
  const authInfo = ctx?.http?.authInfo ?? ctx?.authInfo;
  const extra = authInfo?.extra ?? {};
  return {
    tenantId: extra.tenantId || null,
  };
}

function tenantOrThrow(ctx) {
  const reader = walletReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Wallets are not available for this account');
  return reader.tenantId;
}

export async function listBalancesForCaller(ctx) {
  return listWalletBalancesRead({ tenantId: tenantOrThrow(ctx) });
}

export async function listTransactionsForCaller(ctx, args) {
  return listWalletTransactionsRead({
    tenantId: tenantOrThrow(ctx),
    walletId: args.walletId,
    query: args ?? {},
  });
}

export function walletBalancesText(output) {
  if (!output.items.length) return 'Wallets.\nNo wallets.';
  const lines = output.items.map(
    (wallet) =>
      `${wallet.name} [${wallet.currency}] ${wallet.status} balance ${wallet.balance} allocated ${wallet.allocatedAmount} unallocated ${wallet.unallocatedAmount}`,
  );
  return ['Wallets.', ...lines].join('\n');
}

export function walletTransactionsText(output) {
  const { items, pagination } = output;
  const header = `Wallet transactions. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching transactions.`;
  const lines = items.map(
    (row) => `${row.type} ${row.amount} balance ${row.balanceAfter} available ${row.availableAfter}`,
  );
  return [header, ...lines].join('\n');
}

export function walletToolError(err, fallback) {
  if (err instanceof NotFoundError) return 'Wallet not found.';
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
