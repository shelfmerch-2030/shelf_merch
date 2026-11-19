import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const dir = 'previews/copilot/launch-safety-v2';
const changedFiles = [
  'apps/api/src/modules/campaigns/pointsLaunch.service.js',
  'apps/api/src/modules/campaigns/pointsApprovalGuard.js',
  'apps/api/src/modules/campaigns/campaign.model.js',
  'apps/api/src/modules/campaigns/recipient.model.js',
  'apps/api/src/modules/campaigns/campaigns.service.js',
  'apps/api/src/modules/campaigns/campaigns.controller.js',
  'apps/api/src/modules/campaigns/campaigns.validation.js',
  'apps/api/src/modules/mcp/campaignsSendWrite.js',
  'apps/api/src/modules/notifications/notifications.service.js',
  'apps/api/src/services/ledger.service.js',
  'apps/api/src/jobs/scheduledCampaign.worker.js',
  'apps/web/src/services/mutations-api.ts',
  'apps/api/tests/points-launch-acceptance.test.js',
  'apps/api/tests/points-invitation-notify.test.js',
  'apps/api/tests/campaigns-redemption.test.js',
  'apps/api/tests/write-recovery.test.js',
  'apps/api/tests/mcp-slack-notifications.test.js',
  'apps/web/src/services/pointsLaunchApproval.test.ts',
];
const allowed = new Set(changedFiles);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const before = fs.readFileSync(`${dir}/before-working-tree.patch`, 'utf8').split(/(?=^diff --git )/m).filter(chunk => chunk.startsWith('diff --git '));
let preservedTracked = 0;
const beforePaths = new Set();
for (const chunk of before) {
  const file = chunk.match(/^diff --git a\/(.*?) b\/.*\n/)[1];
  beforePaths.add(file);
  if (allowed.has(file)) continue;
  const current = execFileSync('git', ['diff', '--binary', '--', file], { maxBuffer: 32 * 1024 * 1024 });
  if (hash(current) !== hash(Buffer.from(chunk))) throw new Error(`Unrelated tracked diff changed: ${file}`);
  preservedTracked++;
}
for (const file of execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n')) {
  if (file && !allowed.has(file) && !beforePaths.has(file)) throw new Error(`Unexpected changed file: ${file}`);
}
const earlier = JSON.parse(fs.readFileSync('previews/copilot/launch-safety-isolated/before.json', 'utf8'));
let preservedEarlier = 0;
for (const [file, expected] of Object.entries(earlier.untouched)) {
  if (allowed.has(file)) continue;
  if (hash(fs.readFileSync(file)) !== expected) throw new Error(`Earlier unrelated file changed: ${file}`);
  preservedEarlier++;
}
const reports = ['staged-final', 'ledger-wallet-verified', 'write-state-verified', 'acceptance-verified', 'rest-redemption-verified', 'recovery-notices-verified', 'web-final'];
const seen = new Set();
const tests = reports.map(name => {
  const report = JSON.parse(fs.readFileSync(`${dir}/${name}.json`, 'utf8'));
  const assertions = report.testResults.flatMap(file => file.assertionResults);
  if (!report.success || report.numFailedTests || report.numPendingTests || assertions.length !== report.numPassedTests
    || assertions.some(test => test.status !== 'passed')) throw new Error(`Incomplete/failing report: ${name}`);
  for (const file of report.testResults) {
    if (seen.has(file.name)) throw new Error(`Duplicate file counted: ${file.name}`);
    seen.add(file.name);
  }
  return { name, files: report.testResults.length, passed: assertions.length, failed: 0, pending: 0 };
});

const typecheckBytes = fs.readFileSync(`${dir}/typecheck.txt`);
const typecheckText = typecheckBytes[0] === 0xff && typecheckBytes[1] === 0xfe
  ? typecheckBytes.subarray(2).toString('utf16le') : typecheckBytes.toString('utf8');
const currentErrors = [...typecheckText.matchAll(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/gm)]
  .map(match => ({ file: match[1], line: Number(match[2]), code: Number(match[4]), message: match[5] }));
if (!currentErrors.length) throw new Error('Expected failed typecheck diagnostics were not parsed');
const tsDiff = execFileSync('git', ['diff', '--', 'apps/web/src/services/mutations-api.ts'], { encoding: 'utf8' });
const changedRanges = [...tsDiff.matchAll(/^@@ .*? \+(\d+)(?:,(\d+))? @@/gm)]
  .map(match => [Number(match[1]), Number(match[1]) + Number(match[2] || 1)]);
const changedRegionErrors = currentErrors.filter(row => row.file === 'src/services/mutations-api.ts'
  && changedRanges.some(([start, end]) => row.line >= start && row.line < end));
if (changedRegionErrors.length) throw new Error('TypeScript errors in edited regions require review');
const summary = { changedFiles, preservedTracked, preservedEarlier, tests,
  totalPassed: tests.reduce((sum, row) => sum + row.passed, 0),
  typecheck: { passed: false, diagnosticCount: currentErrors.length, changedRegionErrors, errors: currentErrors } };
fs.writeFileSync(`${dir}/verification-summary.json`, JSON.stringify(summary, null, 2));
process.stdout.write(JSON.stringify({ preservedTracked, preservedEarlier, tests, totalPassed: summary.totalPassed,
  typecheckErrors: currentErrors.length, changedRegionTypecheckErrors: changedRegionErrors.length }, null, 2));
