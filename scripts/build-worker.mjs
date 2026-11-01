import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const outdir = path.join(root, 'dist-worker');
const template = path.join(root, 'worker', 'template.ts');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp'
};

async function collect(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collect(fullPath, relative));
    else {
      const body = await fs.readFile(fullPath);
      const extension = path.extname(entry.name).toLowerCase();
      result[relative] = {
        body: body.toString('base64'),
        type: mimeTypes[extension] ?? 'application/octet-stream',
        immutable: relative.startsWith('assets/')
      };
    }
  }
  return result;
}

const assets = await collect(dist);
const source = await fs.readFile(template, 'utf8');
const marker = 'const STATIC_ASSETS: Record<string, StaticAsset> = __STATIC_ASSETS__;';
const replacement = `const STATIC_ASSETS: Record<string, StaticAsset> = ${JSON.stringify(assets)};`;
if (!source.includes(marker)) throw new Error('Worker asset marker is missing.');
const compiledSource = source.replace(marker, replacement);
await fs.mkdir(outdir, { recursive: true });
await build({
  stdin: { contents: compiledSource, resolveDir: path.dirname(template), sourcefile: 'worker.ts', loader: 'ts' },
  outfile: path.join(outdir, 'worker.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none'
});
