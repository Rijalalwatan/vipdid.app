import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const password = 'VIP2026';
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 210000, 32, 'sha256');
const now = "(unixepoch() * 1000)";
const file = path.resolve(import.meta.dirname, '..', 'database', 'seed.sql');
const sql = `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES
  ('site_lock_enabled', '1', ${now}),
  ('site_lock_password_hash', '${hash.toString('base64')}', ${now}),
  ('site_lock_password_salt', '${salt.toString('base64')}', ${now}),
  ('treasury_balance', '1000000000000', ${now}),
  ('next_permanent_id_seq', '1', ${now});

INSERT OR IGNORE INTO tenants (
  id, slug, name_ar, name_en, logo_url, cover_url, description_ar, description_en,
  theme_config_json, status, owner_user_id, assigned_moderator_id, is_managed_by_admin,
  custody_transfer_email, custody_token_hash, custody_token_expires, created_by, created_at, approved_by, approved_at
) VALUES (
  'tenant_main', 'vipdid', 'الهوية الرقمية لكبار الشخصيات', 'VIP Digital ID',
  '/brand/logo.webp', '/brand/cover.webp', 'منصة الهوية الرقمية لكبار الشخصيات', 'VIP Digital ID platform',
  '{"theme":"gold-charcoal"}', 'active', 'user_c1', NULL, 1, NULL, NULL, NULL, 'system', ${now}, 'user_c1', ${now}
);

INSERT OR IGNORE INTO users (
  id, permanent_id, tenant_id, name, email, phone, whatsapp, pin_hash, pin_salt, email_verified_at, pin_set_at, last_login_at,
  role, is_managed, managed_by_user_id, custody_transfer_email, custody_token_hash, custody_token_expires,
  referred_by_permanent_id, wallet_balance, status, failed_login_attempts, locked_until,
  terms_accepted_at, privacy_accepted_at, eligibility_acknowledged_at, created_at
) VALUES (
  'user_c1', 'C1', 'tenant_main', 'مالك المنصة', 'rijalalwatan.com@gmail.com', NULL, '966555444959', NULL, NULL, ${now}, NULL, NULL,
  'super_admin', 0, NULL, NULL, NULL, NULL, NULL, 0, 'active', 0, NULL, ${now}, ${now}, ${now}, ${now}
);
`;
await fs.writeFile(file, sql, 'utf8');
console.log(createHash('sha256').update(sql).digest('hex'));
