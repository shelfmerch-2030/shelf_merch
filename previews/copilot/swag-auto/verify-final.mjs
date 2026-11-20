import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'previews/copilot/swag-auto';
const before = JSON.parse(fs.readFileSync(`${directory}/before.json`, 'utf8'));
const changedFiles = [
  'apps/api/src/modules/collections/collection.model.js',
  'apps/api/src/modules/collections/collectionQueries.js',
  'apps/api/src/modules/collections/collectionDesign.service.js',
  'apps/api/src/modules/storefront/brandedShopProducts.js',
  'apps/web/src/services/mappers.ts',
  'apps/web/src/features/swag/mockup-bake.ts',
  'apps/web/src/features/swag/bakeCollectionDesign.ts',
  'apps/web/src/features/swag/DesignedProductThumb.tsx',
  'apps/web/src/features/swag/artworkScope.test.tsx',
  'apps/api/src/modules/copilot/swagDesignWorkflow.js',
  'apps/api/src/modules/copilot/swagArtwork.service.js',
  'apps/api/src/modules/copilot/swagRenderer.service.js',
  'apps/api/src/modules/copilot/copilot.routes.js',
  'apps/api/src/modules/copilot/copilot.controller.js',
  'apps/api/src/modules/copilot/copilotChat.service.js',
  'apps/web/src/features/swag/rendererEntry.ts',
  'apps/web/src/features/copilot/CopilotPage.tsx',
  'apps/web/src/features/copilot/CopilotConfirmationCard.tsx',
  'apps/web/src/features/copilot/useSwagConversation.ts',
  'apps/web/src/features/copilot/SwagWorkflowPanel.tsx',
  'apps/web/src/features/copilot/SwagSavedPreviews.tsx',
  'apps/web/src/features/copilot/swagPresentation.ts',
  'apps/web/src/features/copilot/swagApi.ts',
  'apps/api/tests/copilot-swag-artwork.renderer-check.js',
  'apps/api/tests/copilot-swag-artwork.browser-check.js',
  'apps/api/tests/fixtures/swagArtwork.js',
  'apps/api/tests/copilot-swag-chat.test.js',
  'apps/api/tests/copilot-swag.browser-check.js',
  'apps/web/src/features/copilot/CopilotSwagArtwork.test.tsx',
  'scripts/build-swag-renderer.mjs',
  'apps/api/package.json', 'package.json', 'package-lock.json', '.gitignore', 'apps/api/Dockerfile',
  'docs/copilot-swag-artwork.md',
];
const allowed = new Set(changedFiles), edited = [];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(before)) {
  if (!fs.existsSync(file)) throw Error(`Original source removed: ${file}`);
  if (hash(file) !== expected) { if (!allowed.has(file)) throw Error(`Unrelated source changed: ${file}`); edited.push(file); }
}
for (const file of execFileSync('rg', ['--files', 'apps', '-g', '!node_modules', '-g', '!dist'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/'))) {
  if (!before[file] && !allowed.has(file)) throw Error(`Unexpected application source added: ${file}`);
}
for (const file of changedFiles) if (!fs.existsSync(file)) throw Error(`Missing deliverable: ${file}`);
for (const file of ['apps/web/src/features/swag/wizard/artworkStepModel.ts', 'apps/web/src/lib/printCoords.ts']) {
  if (hash(file) !== before[file]) throw Error('Existing placement geometry changed: '+file);
}
const pipeline='apps/web/src/features/swag/mockup-bake.ts';
const originalPipeline=fs.readFileSync(directory+'/baseline/'+pipeline,'utf8').replaceAll('\r\n','\n');
const currentPipeline=fs.readFileSync(pipeline,'utf8').replaceAll('\r\n','\n');
for (const [startMarker,endMarker] of [
 ['export function resolvePrintAreaStage(', 'export function placementKey('],
 ['export function defaultPlacement(', 'export function loadImageEl('],
 ['export function buildRealisticArtwork(', 'export function resolvePlacementForBake('],
 ['export async function bakeMockupLayers(', 'export function collectBakeLayers('],
 ['export async function exportDesignOnly(', 'const tintedBakeCache ='],
 ['  if (product.mockupUrl || product.mockupBackUrl) {','  if (!areaCount)'],
]) {
 const extract=text=>text.slice(text.indexOf(startMarker),text.indexOf(endMarker,text.indexOf(startMarker)));
 if(!originalPipeline.includes(startMarker)||extract(originalPipeline)!==extract(currentPipeline))throw Error('Existing renderer or saved-mockup preference changed: '+startMarker);
}
execFileSync('git', ['diff', '--check', '--', ...changedFiles]);

const reports = ['artwork-final', 'artwork-browser-final', 'image-consistency-final', 'acceptance-final', 'catalog-final', 'api-dashboard-final',
  'api-copilot-state-final', 'api-copilot-attachments-final', 'api-copilot-reads-final', 'api-copilot-domains-final', 'api-copilot-provider-final',
  'api-financial-final', 'api-redemption-final', 'web-final', 'browser-test'];
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
if (totalPassed !== 659) throw Error(`Final acceptance inventory incomplete: ${totalPassed}/659`);
const diagnostics = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /error TS\d+/.test(line)).map(line => line.replace(/\(\d+,\d+\)/, '')).sort();
const oldDiagnostics = diagnostics('previews/copilot/swag-artwork/typecheck.txt'), currentDiagnostics = diagnostics(`${directory}/typecheck.txt`);
if (JSON.stringify(oldDiagnostics) !== JSON.stringify(currentDiagnostics) || /fatal error|out of memory|panic:/i.test(fs.readFileSync(`${directory}/typecheck.txt`, 'utf8'))) throw Error('Typecheck diagnostic set changed or did not finish');

const manifest = JSON.parse(fs.readFileSync('apps/api/renderer/manifest.json', 'utf8'));
if (hash('apps/api/renderer/swag-renderer.js') !== manifest.bundleHash || Object.keys(manifest.sources).length < 6) throw Error('Missing or invalid private renderer manifest');
for (const [file, expected] of Object.entries(manifest.sources)) if (hash(file) !== expected) throw Error(`Stale renderer source: ${file}`);
for (const file of ['apps/api/src/modules/copilot/swagRenderer.service.js', 'apps/api/tests/copilot-swag-artwork.browser-check.js', 'apps/api/tests/copilot-swag.browser-check.js']) {
  if (fs.readFileSync(file, 'utf8').includes("'--no-sandbox'")) throw Error(`Browser sandbox disabled: ${file}`);
}
const browser = JSON.parse(fs.readFileSync(`${directory}/browser/browser-evidence.json`, 'utf8'));
if (browser.errors.length || browser.executeRequests !== 2 || browser.totalCollections !== 1 || browser.liveWorkspaceData !== false
  || !browser.checks.some(check => check.includes('reload preserves the uploaded logo'))) throw Error('Full artwork browser evidence incomplete');
const legacyBrowser = JSON.parse(fs.readFileSync('previews/copilot/swag-interactive/browser-evidence.json', 'utf8'));
if (legacyBrowser.errors.length || legacyBrowser.executeRequests !== 1 || legacyBrowser.totalCollections !== 1 || legacyBrowser.liveWorkspaceData !== false) throw Error('Existing skip-artwork browser path failed');
const imageBrowser = JSON.parse(fs.readFileSync('previews/copilot/swag-artwork/browser-images.json', 'utf8'));
if (imageBrowser.results.length !== 2 || imageBrowser.results.some(row => row.images.length !== 12 || row.images.some(image => !row.expected.includes(image)))) throw Error('Image consistency browser evidence failed');
const summary = { status: 'Implemented and verified for controlled local testing with an approved configured browser',
  totalPassed, failed: 0, pending: 0, uniqueTestFiles: files.size, changedFiles,
  preservedBaselineFiles: Object.keys(before).length - edited.length, editedBaselineFiles: edited,
  existingTypeScriptDiagnostics: currentDiagnostics.length, newTypeScriptDiagnostics: 0,
  rendererBundleHash: manifest.bundleHash, rendererSourceFiles: Object.keys(manifest.sources).length,
  linuxContainerRuntimeTested: false, liveCustomerDataUsed: false, results };
fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
