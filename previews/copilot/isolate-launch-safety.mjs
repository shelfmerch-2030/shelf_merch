// One-time, scoped isolation of the unfinished launch patch. No Git writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const archive = 'previews/copilot/launch-safety-isolated';
const service = 'apps/api/src/modules/campaigns/campaigns.service.js';
const send = 'apps/api/src/modules/mcp/campaignsSendWrite.js';
const models = ['apps/api/src/modules/campaigns/campaign.model.js', 'apps/api/src/modules/campaigns/recipient.model.js'];
const isolated = ['apps/api/src/modules/campaigns/pointsLaunchSafety.js', 'apps/api/src/modules/campaigns/launchImmutability.plugin.js', 'apps/api/tests/send-points-launch-safety.test.js'];
const files = [service, send, ...models, ...isolated];
const normalize = value => value.replaceAll('\r\n', '\n');
const read = file => normalize(fs.readFileSync(file, 'utf8'));
const head = file => normalize(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const status = execFileSync('git', ['status', '--porcelain', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map(row => row.slice(3));
const untouched = Object.fromEntries(status.filter(file => !files.includes(file) && fs.existsSync(file) && fs.statSync(file).isFile()).map(file => [file, hash(file)]));
if (fs.existsSync(`${archive}/before.json`)) throw new Error('Isolation already run; refusing to overwrite backup');
for (const file of files) {
  const target = path.join(archive, `${file}.disabled`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}
fs.writeFileSync(`${archive}/before.json`, JSON.stringify({ root, files, untouched }, null, 2));

function replaceOnce(text, from, to) {
  if (!text.includes(from) || text.indexOf(from) !== text.lastIndexOf(from)) throw new Error(`Ambiguous/missing fragment: ${from.slice(0, 100)}`);
  return text.replace(from, to);
}
function span(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing span ${start}`);
  return text.slice(from, to);
}
let current = read(service);
const base = head(service);
current = replaceOnce(current, "import mongoose from 'mongoose';\n", '');
current = replaceOnce(current, "import { withPointsLaunch, pointsLaunchBinding, assertPointsLaunch, claimPointsInvitation, dispatchPointsInvitation, touchLaunch, leaseFilter } from './pointsLaunchSafety.js';\n", '');
for (const [start, end] of [
  ['async function upsertRecipientsFromList(', 'async function applyImportRecipients('],
  ['async function finishLaunchInvites(', 'async function createFulfillmentOrdersIfNeeded('],
  ['export async function deliverScheduledCampaign(', 'export async function processDueScheduledCampaigns('],
  ['export async function launchCampaign(', 'export async function closeCampaign('],
]) current = replaceOnce(current, span(current, start, end), span(base, start, end));
// Preserve the earlier financial-integrity checks that predate the launch patch.
current = replaceOnce(current,
  "  // Credit points now (held at 0 from allocate when scheduled).",
  "  await ledger.resolveSpendWalletForEntity({ tenantId, entityId: campaign.entityId });\n  // Credit points now (held at 0 from allocate when scheduled).");
const launchStart = current.indexOf('export async function launchCampaign(');
let launch = current.slice(launchStart);
launch = replaceOnce(launch, '  const launchLease = await acquireCampaignLaunch(campaign);',
  '  await ledger.resolveSpendWalletForEntity({ tenantId, entityId: campaign.entityId });\n  const launchLease = await acquireCampaignLaunch(campaign);');
current = current.slice(0, launchStart) + launch;
current = replaceOnce(current,
  "  if (campaign.type === 'points') {\n    const editable = await Campaign.updateOne({ tenantId, _id: campaign._id, 'launchApproval.hash': { $exists: false } }, { $inc: { __v: 1 } }, { session });\n    if (editable.matchedCount !== 1) throw new ApiError(409, 'An approved launch cannot be edited', 'CAMPAIGN_LAUNCH_LOCKED');\n  }\n\n", '');
current = replaceOnce(current,
  "  if (!input?.idempotencyKey) {\n    const target = await Campaign.findOne({ tenantId: input.tenantId, _id: input.campaignId }).select('type');\n    if (target?.type !== 'points') return applyAllocateCredits(input);\n    const session = await mongoose.startSession();\n    try {\n      let result;\n      await session.withTransaction(async () => { result = await applyAllocateCredits({ ...input, session }); });\n      return result;\n    } finally { await session.endSession(); }\n  }",
  '  if (!input?.idempotencyKey) return applyAllocateCredits(input);');
// Metadata filtering remains to avoid exposing any historical internal field.
fs.writeFileSync(service, current);

let mcp = read(send);
for (const fragment of [
  "import { pointsLaunchBinding } from '../campaigns/pointsLaunchSafety.js';\n",
  '        launchBinding: planned.launchBinding = (await pointsLaunchBinding(tenantId, state.campaign._id, planned.actor.user)).hash,\n',
  '    recoveryProof: async () => ({ version: 1, launchBinding: planned.launchBinding }),\n',
  "  const confirmation = await McpWriteConfirmation.findOne({ tenantId, actorUserId, operation: 'campaigns.launch', confirmationId }).select('recoveryProof');\n",
  '  const expectedLaunchHash = confirmation?.recoveryProof?.version === 1 ? confirmation.recoveryProof.launchBinding : null;\n',
  "      if (!expectedLaunchHash || (await pointsLaunchBinding(tenantId, requested.campaignId, actor.user)).hash !== expectedLaunchHash) return { outcome: 'uncertain' };\n",
  "      if (!expectedLaunchHash) throw new ApiError(409, 'Prepare a fresh launch preview', 'CONFIRMATION_STALE');\n",
  '        expectedLaunchHash,\n',
  '    launchBinding: (await pointsLaunchBinding(tenantId, campaignId, actor.user)).hash,\n',
]) mcp = replaceOnce(mcp, fragment, '');
fs.writeFileSync(send, mcp);
for (const file of models) fs.writeFileSync(file, head(file));
for (const file of isolated) fs.unlinkSync(file); // Exact paths backed up above.
const changed = Object.entries(untouched).filter(([file, before]) => hash(file) !== before);
if (changed.length) throw new Error(`Unrelated files changed: ${JSON.stringify(changed)}`);
process.stdout.write(`Isolated launch patch; verified ${Object.keys(untouched).length} unrelated files unchanged.\n`);
