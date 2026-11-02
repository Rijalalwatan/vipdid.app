import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (file, fragments) => {
  const source = read(file);
  for (const fragment of fragments) if (!source.includes(fragment)) throw new Error(`${file}: missing ${fragment}`);
  return source;
};

const worker = requireText('worker/template.ts', [
  'PIN_PEPPER_SECRET',
  'derivePinHash',
  "vipdid:pin:v2:",
  'requireStepUpPin',
  'allocatePermanentId',
  "UPDATE system_settings SET value = CAST(value AS INTEGER) + 1",
  'RETURNING value',
  'mediaAsset(request, env, id)',
  "snapshotOf(media.published_json, media.name).mediaIds.includes(id)",
  "'cache-control': published ? 'public, max-age=31536000, immutable' : 'private, no-cache, no-store'",
  'allowedTurnstileHostname',
  'custom_domain = ?',
  'issued === requested',
  'frame-ancestors https://vipdid.app',
  "async function sovereignLock",
  "async function adminDirectGrant",
  "async function approvePartner",
  "async function partnerManaged"
]);
if (/x-frame-options/i.test(worker)) throw new Error('worker/template.ts: incompatible X-Frame-Options header found');
if (worker.includes("frame-ancestors 'none'") || worker.includes("frame-ancestors 'self'")) throw new Error('worker/template.ts: incompatible frame-ancestors policy found');
if (/const sequence = Math\.max\(1, Number\(await setting\(env, 'next_permanent_id_seq'\)/.test(worker)) throw new Error('worker/template.ts: legacy read/write permanent ID allocation remains');

requireText('database/migrations/0008_security_stability.sql', ['ALTER TABLE tenants ADD COLUMN custom_domain', 'idx_tenants_custom_domain']);
requireText('database/schema.sql', ['custom_domain TEXT UNIQUE COLLATE NOCASE', 'idx_tenants_custom_domain']);
requireText('src/components/SovereignDashboard.tsx', ['stepUpPin', 'text.stepUpLead']);
requireText('src/components/PartnerDashboard.tsx', ['stepUpPin', 'text.stepUpLead']);
requireText('src/components/WalletPortal.tsx', ['adminPin', 'stepUpPin: adminPin']);
console.log('security_stability_static_checks=passed');
