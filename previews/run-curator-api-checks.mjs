// Isolated test defaults: never use local provider credentials or write rollout flags.
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const cwd = fileURLToPath(new URL('apps/api/', root));
const flags = await readFile(new URL('apps/api/src/modules/copilot/copilotWriteFlags.js', root), 'utf8');
const env = { ...process.env, NODE_ENV: 'test', COPILOT_AI_PROVIDER: 'openai', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', STORAGE_DRIVER: 'local' };
for (const key of flags.match(/EMBEDDED_COPILOT_WRITE_[A-Z_]+/g) || []) env[key] = 'false';
delete env.MONGODB_TEST_URI;
const files = (await readdir(new URL('apps/api/tests/', root))).filter(name => /^copilot.*\.test\.js$/.test(name)).sort();
let output = '';
let failed = false;
for (let start = 0; start < files.length; start += 5) {
  const group = files.slice(start, start + 5).map(name => `tests/${name}`);
  const label = `Batch ${start / 5 + 1}: ${group.join(', ')}\n`;
  console.log(label);
  output += label;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/vitest/vitest.mjs', root)), 'run', '--pool=threads', ...group], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { output += data.toString(); });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  failed ||= code !== 0;
  console.log(`Exit: ${code}`);
}
await writeFile(new URL('previews/copilot/curator-api-tests.txt', root), output);
process.exitCode = failed ? 1 : 0;
