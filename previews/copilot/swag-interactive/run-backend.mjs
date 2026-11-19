import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const dir = path.resolve('previews/copilot/swag-interactive');
const suites = {
  'acceptance-final': ['copilot-swag-design', 'copilot-swag-chat', 'copilot-swag-interactive', 'copilot-response-format'],
  'catalog-final': ['mcp-catalog-read', 'mcp-catalog-search'],
  'browser-test': ['copilot-swag-browser'],
  'api-dashboard-final': ['collections', 'collection-design-merge', 'mcp-collection-publish', 'shop-catalog-visibility', 'copilot-mcp-catalog', 'copilot-writes-registry', 'copilotDiscovery'],
  'api-copilot-state-final': ['copilot-write-state'],
  'api-copilot-attachments-final': ['copilot-attachments'],
  'api-copilot-reads-final': ['copilot-reads-complete'],
  'api-copilot-domains-final': ['copilot-writes-domains'],
  'api-copilot-provider-final': ['copilot-anthropic-provider'],
  'api-financial-final': ['mcp-write-safety', 'combined-send-points', 'ledger', 'financial-wallet-integrity'],
};
const summary = [];
for (const [name, files] of Object.entries(suites)) {
  if (process.argv[2] && !name.startsWith(process.argv[2])) continue;
  const env = { ...process.env };
  // Read-only baselines assume domain writes are disabled; tests enable their own domains.
  for (const key of fs.readFileSync('apps/api/src/modules/copilot/copilotWriteFlags.js', 'utf8').match(/EMBEDDED_COPILOT_WRITE_[A-Z_]+/g) || []) env[key] = 'false';
  // Always create our own MongoMemoryReplSet; never inherit a configured database URI.
  delete env.MONGODB_TEST_URI;
  const log = fs.openSync(path.join(dir, `${name}.log`), 'w');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', '../../node_modules/vitest/vitest.mjs', 'run',
      ...files.map(file => file === 'copilot-swag-browser' ? 'tests/copilot-swag.browser-check.js' : `tests/${file}.test.js`),
      ...(name === 'browser-test' ? ['--config', path.join(dir, 'vitest-browser.config.mjs')] : []), '--pool=threads', '--maxWorkers=1', '--reporter=json',
      `--outputFile=${path.join(dir, `${name}.json`)}`], { cwd: path.resolve('apps/api'), env, stdio: ['ignore', log, log], windowsHide: true });
    child.once('error', reject); child.once('close', resolve);
  });
  fs.closeSync(log);
  let validation;
  try {
    const report = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    const assertions = report.testResults.flatMap(file => file.assertionResults);
    validation = { name, exitCode: code, passed: report.numPassedTests, failed: report.numFailedTests,
      pending: report.numPendingTests, complete: assertions.length === report.numTotalTests,
      allPassed: report.success && assertions.length === report.numTotalTests && assertions.every(test => test.status === 'passed') };
  } catch (error) { validation = { name, exitCode: code, allPassed: false, error: error.message }; }
  summary.push(validation);
  console.log(JSON.stringify(validation));
  fs.writeFileSync(path.join(dir, 'backend-run-summary.json'), JSON.stringify(summary, null, 2));
  if (!validation.allPassed) process.exitCode = 1;
}
