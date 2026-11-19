// Read-only implementation/test verification. Writes only its evidence summary.
import fs from 'node:fs';
import crypto from 'node:crypto';

const dir = 'previews/copilot/one-confirmation';
const implementationFiles = [
  'apps/api/src/modules/copilot/sendPointsWorkflow.js',
  'apps/api/src/modules/campaigns/campaigns.service.js',
  'apps/api/src/modules/campaigns/pointsLaunch.service.js',
  'apps/api/src/modules/mcp/campaignsDraftWrite.js',
  'apps/api/src/modules/mcp/mcpWriteSafety.js',
  'apps/api/src/modules/copilot/copilotMcpCatalog.js',
  'apps/api/src/modules/copilot/copilotToolBindings.js',
  'apps/api/src/modules/copilot/copilotWrites.service.js',
  'apps/api/src/modules/copilot/copilotChat.service.js',
  'apps/api/src/modules/copilot/copilotDiscovery.js',
  'apps/api/src/modules/copilot/copilotWriteState.service.js',
  'apps/web/src/features/copilot/actionPresentation.ts',
  'apps/web/src/features/copilot/api.ts',
  'apps/web/src/features/copilot/CopilotConfirmationCard.tsx',
  'apps/api/tests/combined-send-points.test.js',
  'apps/api/tests/copilot-mcp-catalog.test.js',
  'apps/api/tests/copilotDiscovery.test.js',
  'apps/web/src/features/copilot/CopilotCombinedPoints.test.tsx',
];
const allowed = new Set(implementationFiles);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = JSON.parse(fs.readFileSync(`${dir}/before.json`, 'utf8'));
const unchanged = [], changed = [];
for (const [file, expected] of Object.entries(before)) {
  if (!fs.existsSync(file)) throw new Error(`Snapshotted file is missing: ${file}`);
  if (hash(file) === expected) unchanged.push(file);
  else {
    if (!allowed.has(file)) throw new Error(`Unrelated snapshotted file changed: ${file}`);
    changed.push(file);
  }
}
const reports = ['combined-final', 'staged-final', 'launch-ledger-final', 'wallet-final', 'write-state-final',
  'notification-read-final', 'redemption-final', 'recovery-notices-final', 'web-final'];
const seen = new Set();
const tests = reports.map(name => {
  const report = JSON.parse(fs.readFileSync(`${dir}/${name}.json`, 'utf8'));
  const assertions = report.testResults.flatMap(file => file.assertionResults);
  if (!report.success || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTotalTests !== assertions.length || report.numPassedTests !== assertions.length
    || assertions.some(test => test.status !== 'passed')) throw new Error(`Incomplete/failed report: ${name}`);
  for (const file of report.testResults) {
    if (file.status !== 'passed' || seen.has(file.name)) throw new Error(`Failed or duplicate test file: ${file.name}`);
    seen.add(file.name);
  }
  return { report: `${name}.json`, files: report.testResults.length, passed: assertions.length, failed: 0, pending: 0,
    ...(name === 'redemption-final' ? { pool: 'threads', supersedes: 'redemption-incomplete.json' } : {}) };
});
const typecheckBytes = fs.readFileSync(`${dir}/typecheck.txt`);
const typecheckText = typecheckBytes[0] === 0xff && typecheckBytes[1] === 0xfe
  ? typecheckBytes.subarray(2).toString('utf16le') : typecheckBytes.toString('utf8');
const diagnostics = [...typecheckText.matchAll(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/gm)]
  .map(match => ({ file: match[1], line: Number(match[2]), code: Number(match[4]), message: match[5] }));
const baseline = JSON.parse(fs.readFileSync('previews/copilot/launch-safety-v2/verification-summary.json', 'utf8'));
const diagnosticKeys = rows => rows.map(row => `${row.file}:${row.code}:${row.message.replace(/\s+/g, ' ').trim()}`).sort();
const sameDiagnostics = JSON.stringify(diagnosticKeys(diagnostics)) === JSON.stringify(diagnosticKeys(baseline.typecheck.errors));
if (diagnostics.length !== 26 || !sameDiagnostics) throw new Error('Typecheck diagnostics changed; review before final reporting');
const summary = {
  verificationDate: '2026-11-13', timezone: 'Asia/Calcutta', implementationChangedDuringResumption: false,
  implementationFiles: implementationFiles.map(file => ({ path: file, sha256: hash(file) })),
  preservation: { snapshottedFiles: Object.keys(before).length, unchangedFiles: unchanged.length,
    intendedModifiedFiles: changed, unexpectedChanges: [], scope: 'Files recorded in the pre-implementation dirty-file snapshot' },
  tests, apiPassed: tests.filter(row => row.report !== 'web-final.json').reduce((sum, row) => sum + row.passed, 0),
  frontendPassed: tests.find(row => row.report === 'web-final.json').passed,
  totalPassed: tests.reduce((sum, row) => sum + row.passed, 0), uniqueTestFiles: seen.size,
  failed: 0, pending: 0,
  typecheck: { passed: false, diagnostics, unchangedFromLaunchSafetyVerification: sameDiagnostics },
};
fs.writeFileSync(`${dir}/verification-summary.json`, JSON.stringify(summary, null, 2));
process.stdout.write(JSON.stringify({ apiPassed: summary.apiPassed, frontendPassed: summary.frontendPassed,
  totalPassed: summary.totalPassed, uniqueTestFiles: summary.uniqueTestFiles, failed: 0, pending: 0,
  unchangedSnapshottedFiles: unchanged.length, intendedSnapshotModifications: changed.length,
  typecheckDiagnostics: diagnostics.length, typecheckDiagnosticsUnchanged: sameDiagnostics }, null, 2));
