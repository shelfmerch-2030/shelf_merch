import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'previews/copilot/swag-artwork';
const baseline = JSON.parse(fs.readFileSync(`${directory}/before.json`, 'utf8'));
const changedFiles = [
  'apps/web/src/features/swag/mockup-bake.ts',
  'apps/web/src/features/swag/savedMockupConsistency.test.tsx',
  'apps/api/tests/swag-mockup-consistency.test.js',
  'apps/api/tests/copilot-swag.browser-check.js',
];
const allowed = new Set(changedFiles), altered = [];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(baseline)) {
  if (!fs.existsSync(file)) throw Error(`Original file removed: ${file}`);
  if (hash(file) !== expected) { if (!allowed.has(file)) throw Error(`Unrelated source changed: ${file}`); altered.push(file); }
}
for (const file of execFileSync('rg', ['--files', 'apps', '-g', '!node_modules', '-g', '!dist'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/'))) {
  if (!baseline[file] && !allowed.has(file)) throw Error(`Unexpected added source: ${file}`);
}
execFileSync('git', ['diff', '--check', '--', ...changedFiles]);
if (execFileSync('git', ['diff', '--', 'package-lock.json', 'apps/api/package.json'], { encoding: 'utf8' }).trim()) throw Error('Renderer dependency experiment was not removed');
const reports = ['image-consistency-final', 'acceptance-final', 'catalog-final', 'api-dashboard-final', 'api-copilot-state-final',
  'api-copilot-attachments-final', 'api-copilot-reads-final', 'api-copilot-domains-final', 'api-copilot-provider-final', 'api-financial-final', 'web-final', 'browser-test'];
const files = new Set(), results = [];
for (const name of reports) {
  const report = JSON.parse(fs.readFileSync(`${directory}/${name}.json`, 'utf8'));
  const tests = report.testResults.flatMap(file => file.assertionResults);
  if (!report.success || report.numFailedTests || report.numFailedTestSuites || report.numPendingTests || report.numTodoTests
    || tests.length !== report.numTotalTests || report.numPassedTests !== tests.length || tests.some(test => test.status !== 'passed')) throw Error(`Failed/incomplete final report: ${name}`);
  for (const file of report.testResults) { if (files.has(file.name)) throw Error(`Duplicate test file: ${file.name}`); files.add(file.name); }
  results.push({ report: name, passed: tests.length, failed: 0, pending: 0 });
}
const diagnostics = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /error TS\d+/.test(line)).map(line => line.replace(/\(\d+,\d+\)/, '')).sort();
const oldDiagnostics = diagnostics('previews/copilot/swag-interactive/typecheck.txt'), currentDiagnostics = diagnostics(`${directory}/typecheck.txt`);
if (JSON.stringify(oldDiagnostics) !== JSON.stringify(currentDiagnostics)) throw Error('TypeScript diagnostic set changed');
const browser = JSON.parse(fs.readFileSync(`${directory}/browser-images.json`, 'utf8'));
if (browser.results.length !== 2 || browser.results.some(row => row.images.length !== 12 || row.images.some(image => !row.expected.includes(image)))) throw Error('Incomplete browser image evidence');
const prior = JSON.parse(fs.readFileSync('previews/copilot/swag-interactive/browser-evidence.json', 'utf8'));
if (prior.errors.length || prior.executeRequests !== 1 || prior.totalCollections !== 1 || prior.liveWorkspaceData !== false) throw Error('Isolated publishing browser flow failed');
const summary = { status: 'Image fix verified; automatic artwork application blocked', changedFiles, alteredBaselineFiles: altered,
  preservedBaselineFiles: Object.keys(baseline).length - altered.length, totalPassed: results.reduce((sum, row) => sum + row.passed, 0),
  failed: 0, pending: 0, uniqueTestFiles: files.size, existingTypeScriptDiagnostics: currentDiagnostics.length, newTypeScriptDiagnostics: 0, results };
fs.writeFileSync(`${directory}/verification.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
