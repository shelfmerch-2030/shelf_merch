import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const dir = path.resolve('previews/copilot/swag-timeline');
const configDir = path.resolve('previews/copilot/swag-auto');
const suites = { 'interactive-recovery': ['copilot-swag-interactive'] };
const summary = [];
for (const [name, files] of Object.entries(suites)) {
  if (process.argv[2] === 'browser-checks' ? !['artwork-browser-final','browser-test'].includes(name) : process.argv[2] === 'retry' ? !['artwork-final','catalog-final','browser-test','api-financial-final'].includes(name) : process.argv[2] === 'regressions' ? name === 'artwork-browser-final' : process.argv[2] && !name.startsWith(process.argv[2])) continue;
  const env = { ...process.env, GOMAXPROCS: '2', GOMEMLIMIT: '2GiB' };
  // Read-only baselines assume domain writes are disabled; tests enable their own domains.
  for (const key of fs.readFileSync('apps/api/src/modules/copilot/copilotWriteFlags.js', 'utf8').match(/EMBEDDED_COPILOT_WRITE_[A-Z_]+/g) || []) env[key] = 'false';
  // Always create our own MongoMemoryReplSet; never inherit a configured database URI.
  delete env.MONGODB_TEST_URI;
  env.SWAG_IMAGE_CHECK = name === 'artwork-browser-final' ? 'false' : 'true';
  if (name === 'artwork-final' || name === 'artwork-browser-final') env.SWAG_RENDERER_EXECUTABLE = process.env.SWAG_RENDERER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  else env.SWAG_RENDERER_EXECUTABLE = '';
  const previousReport = path.join(dir, `${name}.json`);
  if (fs.existsSync(previousReport)) fs.renameSync(previousReport, path.join(dir, `${name}.attempt-${Date.now()}.json`));
  const log = fs.openSync(path.join(dir, `${name}.log`), 'w');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', '../../node_modules/vitest/vitest.mjs', 'run',
      ...files.map(file => file === 'copilot-swag-artwork' ? 'tests/copilot-swag-artwork.renderer-check.js' : file === 'copilot-swag-artwork-browser' ? 'tests/copilot-swag-artwork.browser-check.js' : file === 'copilot-swag-browser' ? 'tests/copilot-swag.browser-check.js' : `tests/${file}.test.js`),
      ...(name === 'artwork-final' ? ['--config', path.join(configDir, 'vitest-artwork.config.mjs')] : []), ...(name === 'artwork-browser-final' ? ['--config', path.join(configDir, 'vitest-artwork-browser.config.mjs')] : []), ...(name === 'browser-test' ? ['--config', path.join(configDir, 'vitest-browser.config.mjs')] : []), '--pool=threads', '--maxWorkers=1', '--reporter=verbose', '--reporter=json',
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
      allPassed: code === 0 && report.success && assertions.length === report.numTotalTests && assertions.every(test => test.status === 'passed') };
  } catch (error) { validation = { name, exitCode: code, allPassed: false, error: error.message }; }
  summary.push(validation);
  console.log(JSON.stringify(validation));
  fs.writeFileSync(path.join(dir, 'backend-run-summary.json'), JSON.stringify(summary, null, 2));
  if (!validation.allPassed) process.exitCode = 1;
}
