import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (file, fragments) => {
  const source = read(file);
  for (const fragment of fragments) if (!source.includes(fragment)) throw new Error(`${file}: missing ${fragment}`);
};

requireText('worker/template.ts', [
  'strict-transport-security',
  'content-security-policy',
  "manifest-src 'self'",
  "worker-src 'self'",
  "SameSite=None",
  "function sameOrigin(request: Request)",
  "sec-fetch-site",
  "if (!sameOrigin(request)) return responseJson({ ok: false, reason: 'invalid_request' }, 403);",
  'tenantForRequest',
  'canManageTenant',
  'awardFromTreasury',
  'debitToTreasury'
]);
requireText('public/sw.js', ["url.pathname.startsWith('/api/')", "event.request.headers.has('cookie')", 'vipdid-shell-v4']);
requireText('index.html', ['rel="manifest"', 'logo.webp', 'fetchpriority="high"']);
for (const file of ['public/manifest-ar.webmanifest', 'public/manifest-en.webmanifest']) {
  const manifest = JSON.parse(read(file));
  if (manifest.display !== 'standalone' || !Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error(`${file}: incomplete PWA manifest`);
}
for (const file of ['public/brand/logo-icon-192.webp', 'public/brand/logo-icon.webp']) if (!fs.existsSync(path.join(root, file))) throw new Error(`${file}: missing PWA icon`);

const dictionaries = [
  'src/i18n/content.ts',
  'src/i18n/auth-content.ts',
  'src/i18n/profile-content.ts',
  'src/i18n/governance-content.ts',
  'src/i18n/wallet-content.ts',
  'src/i18n/sovereignty-content.ts'
];
for (const file of dictionaries) {
  const source = read(file);
  const ar = source.match(/ar:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*en:\s*\{/);
  const en = source.match(/en:\s*\{([\s\S]*?)\n\s*\}\s*\};?/);
  if (!ar || !en) throw new Error(`${file}: locale objects not found`);
  const values = (section) => [...section.matchAll(/:\s*'((?:\\'|[^'])*)'/g)].map((match) => match[1]).join('\n');
  const arText = values(ar[1]).replace(/https?:[^'"\s]+|[\w.+-]+@[\w.-]+/g, '').replace(/KSA MEN/g, '');
  const enText = values(en[1]).replace(/https?:[^'"\s]+|[\w.+-]+@[\w.-]+/g, '');
  if (/[\u0600-\u06FF]/.test(enText)) throw new Error(`${file}: Arabic text found in English locale`);
  const latinWords = arText.match(/\b[A-Za-z]{3,}\b/g) ?? [];
  if (latinWords.length) throw new Error(`${file}: non-identifier Latin text in Arabic locale: ${latinWords.join(', ')}`);
}
console.log('phase8_static_security_language_pwa=passed');
