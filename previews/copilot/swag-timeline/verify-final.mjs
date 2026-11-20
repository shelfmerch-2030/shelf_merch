import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'previews/copilot/swag-timeline';
const before = JSON.parse(fs.readFileSync(`${directory}/before.json`, 'utf8'));
const changedFiles = JSON.parse(fs.readFileSync(`${directory}/changed-files.json`, 'utf8'));
const allowed = new Set(changedFiles), edited = [];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(before)) {
  if (!fs.existsSync(file)) throw Error(`Original source removed: ${file}`);
  if (hash(file) !== expected) { if (!allowed.has(file)) throw Error(`Unrelated source changed: ${file}`); edited.push(file); }
}
for (const file of execFileSync('rg', ['--files', 'apps', '-g', '!node_modules', '-g', '!dist'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/'))) {
  if (!before[file] && !allowed.has(file)) throw Error(`Unexpected application source added: ${file}`);
}
const workflowFile='apps/api/src/modules/copilot/swagDesignWorkflow.js';
const readNormalized=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const beforeWorkflow=readNormalized(`${directory}/baseline/${workflowFile}`), currentWorkflow=readNormalized(workflowFile);
const core=text=>text.slice(text.indexOf('async function plan('),text.indexOf('export async function readSwagForCaller('));
if(!core(currentWorkflow)||core(currentWorkflow)!==core(beforeWorkflow))throw Error('Swag planning/approval/execution business services changed');
execFileSync('git', ['diff', '--check', '--', ...changedFiles]);
const reports = ['artwork-final','artwork-browser-final','image-consistency-final','acceptance-final','catalog-final','api-dashboard-final',
  'api-copilot-state-final','api-copilot-attachments-final','api-copilot-reads-final','api-copilot-domains-final','api-copilot-provider-final',
  'api-financial-final','api-redemption-final','web-final','browser-test'];
const results = [], files = new Set();
for (const name of reports) {
  const report = JSON.parse(fs.readFileSync(`${directory}/${name}.json`, 'utf8'));
  const tests = report.testResults.flatMap(file => file.assertionResults);
  if (!report.success || report.numFailedTests || report.numFailedTestSuites || report.numPendingTests || report.numTodoTests
    || !tests.length || tests.length !== report.numTotalTests || tests.length !== report.numPassedTests
    || tests.some(test => test.status !== 'passed')) throw Error(`Failed or incomplete final report: ${name}`);
  for (const file of report.testResults) { if (files.has(file.name)) throw Error(`Duplicate counted test file: ${file.name}`); files.add(file.name); }
  results.push({ report: name, passed: tests.length, failed: 0, pending: 0 });
}
const totalPassed = results.reduce((sum, row) => sum + row.passed, 0);
if (totalPassed !== 704) throw Error(`Final acceptance inventory incomplete: ${totalPassed}/704`);
const diagnostics = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /error TS\d+/.test(line)).map(line => line.replace(/\(\d+,\d+\)/, '')).sort();
const oldDiagnostics = diagnostics('previews/copilot/swag-ux/typecheck.txt'), currentDiagnostics = diagnostics(`${directory}/typecheck.txt`);
if (JSON.stringify(oldDiagnostics) !== JSON.stringify(currentDiagnostics) || /fatal error|out of memory|panic:/i.test(fs.readFileSync(`${directory}/typecheck.txt`, 'utf8'))) throw Error('Typecheck diagnostic set changed or did not finish');
const manifest = JSON.parse(fs.readFileSync('apps/api/renderer/manifest.json', 'utf8'));
if (hash('apps/api/renderer/swag-renderer.js') !== manifest.bundleHash) throw Error('Renderer bundle changed');
for (const [file, expected] of Object.entries(manifest.sources)) if (hash(file) !== expected) throw Error(`Renderer source changed: ${file}`);
const browser = JSON.parse(fs.readFileSync(`${directory}/browser/browser-evidence.json`, 'utf8'));
if (Array.from({length:15},(_,i)=>String(i+1).padStart(2,'0')).some(prefix=>!fs.readdirSync(`${directory}/browser`).some(f=>f.startsWith(prefix+'-')&&f.endsWith('.png')))) throw Error('Missing browser screenshot checkpoint');
if (browser.errors.length || browser.executeRequests !== 3 || browser.totalCollections !== 1 || browser.liveWorkspaceData !== false
  || !browser.checks.some(check => check.includes('Save for Later')) || !browser.checks.some(check => check.includes('one current uploaded-logo preview'))) throw Error('Artwork browser evidence incomplete');
const legacyBrowser = JSON.parse(fs.readFileSync(`${directory}/legacy-browser/browser-evidence.json`, 'utf8'));
if (legacyBrowser.errors.length || legacyBrowser.executeRequests !== 1 || legacyBrowser.totalCollections !== 1 || legacyBrowser.liveWorkspaceData !== false) throw Error('Skip-artwork browser path failed');
const imageBrowser = JSON.parse(fs.readFileSync(`${directory}/legacy-browser-images.json`, 'utf8'));
if (imageBrowser.results.length !== 2 || imageBrowser.results.some(row => row.images.length !== 12 || row.images.some(image => !row.expected.includes(image)))) throw Error('Mockup consistency browser evidence failed');
const summary = { status: 'Verified for controlled local testing; browser used a mocked AI provider and isolated data', totalPassed, failed: 0, pending: 0,
  uniqueTestFiles: files.size, changedFiles: [...edited,...changedFiles.filter(f=>!before[f])], preservedBaselineFiles: Object.keys(before).length - edited.length,
  existingTypeScriptDiagnostics: currentDiagnostics.length, newTypeScriptDiagnostics: 0,
  rendererBundleHash: manifest.bundleHash, liveCustomerDataUsed: false, liveClaudeTested: false, results };
fs.writeFileSync(path.join(directory,'verification.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
