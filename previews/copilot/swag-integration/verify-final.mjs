import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const dir = 'previews/copilot/swag-integration';
const changedFiles = [
  'apps/api/src/modules/collections/collectionDesign.service.js',
  'apps/api/src/modules/collections/collections.routes.js',
  'apps/api/src/modules/copilot/copilotAttachment.model.js',
  'apps/api/src/modules/copilot/copilotAttachments.service.js',
  'apps/api/src/modules/copilot/copilotConversation.model.js',
  'apps/api/src/modules/copilot/copilot.routes.js',
  'apps/api/src/modules/copilot/copilotChat.service.js',
  'apps/api/src/modules/copilot/copilotDiscovery.js',
  'apps/api/src/modules/copilot/copilotMcpCatalog.js',
  'apps/api/src/modules/copilot/copilotToolBindings.js',
  'apps/api/src/modules/copilot/copilotTools.js',
  'apps/api/src/modules/copilot/copilotWrites.service.js',
  'apps/api/src/modules/copilot/swagDesignWorkflow.js',
  'apps/api/src/modules/mcp/mcpWriteSafety.js',
  'apps/api/src/modules/shops/shopCatalogSync.js',
  'apps/api/tests/copilot-swag-design.test.js',
  'apps/api/tests/copilot-swag-chat.test.js',
  'apps/api/tests/copilot-mcp-catalog.test.js',
  'apps/api/tests/copilotDiscovery.test.js',
  'apps/web/src/features/copilot/CopilotConfirmationCard.tsx',
  'apps/web/src/features/copilot/SwagSavedPreviews.tsx',
  'apps/web/src/features/copilot/swagPresentation.ts',
  'apps/web/src/features/copilot/CopilotSwagDesign.test.tsx',
  'apps/web/src/features/copilot/CopilotComposer.tsx',
  'apps/web/src/features/copilot/CopilotUserMessage.tsx',
  'apps/web/src/features/copilot/attachments.ts',
  'apps/web/src/features/copilot/api.ts',
];
const decode = file => {
  const bytes = fs.readFileSync(file);
  return bytes[0] === 255 && bytes[1] === 254 ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
};
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = JSON.parse(decode(`${dir}/before.json`));
const allowed = new Set(changedFiles);
let preserved = 0;
const editedExisting = [];
for (const row of before) {
  if (!fs.existsSync(row.path)) throw new Error(`Previously dirty file removed: ${row.path}`);
  if (hash(row.path).toUpperCase() === row.hash) preserved++;
  else {
    if (!allowed.has(row.path)) throw new Error(`Unrelated work changed: ${row.path}`);
    editedExisting.push(row.path);
  }
}
const original = new Set(before.map(row => row.path));
const dirty = execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard', 'apps'], { encoding: 'utf8' }).trim().split(/\r?\n/);
for (const file of dirty) if (fs.existsSync(file) && !original.has(file) && !allowed.has(file)) throw new Error(`Unexpected changed app file: ${file}`);
execFileSync('git', ['diff', '--check', '--', ...changedFiles], { stdio: 'pipe' });

const reports = ['api-acceptance-final', 'api-dashboard-final', 'api-copilot-final', 'api-financial-final', 'web-final'];
const seenFiles = new Set(); const results = []; let totalPassed = 0;
for (const name of reports) {
  const report = JSON.parse(decode(`${dir}/${name}.json`));
  const assertions = report.testResults.flatMap(file => file.assertionResults);
  if (!report.success || report.numFailedTests || report.numPendingTests || assertions.length !== report.numTotalTests
    || report.numPassedTests !== assertions.length || assertions.some(test => test.status !== 'passed')) throw new Error(`Incomplete/failing report: ${name}`);
  for (const file of report.testResults) {
    if (seenFiles.has(file.name)) throw new Error(`Duplicate regression file: ${file.name}`);
    seenFiles.add(file.name);
  }
  results.push({ name, passed: assertions.length, failed: 0, pending: 0 }); totalPassed += assertions.length;
}
const diagnostics = file => decode(file).split(/\r?\n/).filter(line => /error TS\d+/.test(line)).map(line => line.replace(/\(\d+,\d+\)/, '')).sort();
const baseline = diagnostics('previews/copilot/send-points-success/typecheck.txt');
const current = diagnostics(`${dir}/typecheck.txt`);
if (JSON.stringify(baseline) !== JSON.stringify(current)) throw new Error('Typecheck diagnostic set changed');
const result = { reports: results, totalPassed, failed: 0, pending: 0, uniqueTestFiles: seenFiles.size,
  baselineDirtyAppFiles: before.length, preservedDirtyAppFiles: preserved, editedExistingDirtyAppFiles: editedExisting,
  changedFiles, typecheck: { passed: false, existingDiagnostics: current.length, newDiagnostics: 0 },
  hashes: Object.fromEntries(changedFiles.map(file => [file, hash(file)])) };
fs.writeFileSync(`${dir}/verification-summary.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: totalPassed, failed: 0, pending: 0, uniqueTestFiles: seenFiles.size,
  preservedDirtyAppFiles: preserved, intendedAppFiles: changedFiles.length, existingTypecheckDiagnostics: current.length }));
