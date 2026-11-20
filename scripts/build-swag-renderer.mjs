import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'apps/api/renderer');
const sources = new Map();
await build({ configFile: false, root, logLevel: 'warn', resolve: { alias: { '@': path.join(root, 'apps/web/src') } },
  plugins: [{ name: 'renderer-source-manifest', transform(code, id) {
    if (id.replaceAll('\\', '/').startsWith(`${root.replaceAll('\\', '/')}/apps/`) && !id.includes('?')) sources.set(path.relative(root, id).replaceAll('\\', '/'), crypto.createHash('sha256').update(code).digest('hex'));
  } }],
  build: { outDir: output, emptyOutDir: true, minify: false, lib: { entry: path.join(root, 'apps/web/src/features/swag/rendererEntry.ts'),
    name: 'ShelfMerchSwagRenderer', formats: ['iife'], fileName: () => 'swag-renderer.js' } },
});
// Source hashes use raw files, independent of Vite transforms.
for (const file of sources.keys()) sources.set(file, crypto.createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex'));
const bytes = await fs.readFile(path.join(output, 'swag-renderer.js'));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ bundleHash: crypto.createHash('sha256').update(bytes).digest('hex'), sources: Object.fromEntries(sources) }, null, 2));
console.log('Built private Swag renderer from existing dashboard sources.');
