INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES
  ('site_lock_enabled', '1', (unixepoch() * 1000)),
  ('site_lock_password_hash', 'xuEDty2DBjncYYwD5UyL7i3SlkLclxfdMN60rjWnaFk=', (unixepoch() * 1000)),
  ('site_lock_password_salt', 'e+I0gFOEaAQ4cAK+MfVFSw==', (unixepoch() * 1000)),
  ('treasury_balance', '1000000000000', (unixepoch() * 1000)),
  ('next_permanent_id_seq', '1', (unixepoch() * 1000));

INSERT OR IGNORE INTO tenants (
  id, slug, name_ar, name_en, logo_url, cover_url, description_ar, description_en,
  theme_config_json, status, owner_user_id, assigned_moderator_id, is_managed_by_admin,
  custody_transfer_email, custody_token_hash, custody_token_expires, created_by, created_at, approved_by, approved_at
) VALUES (
  'tenant_main', 'vipdid', 'الهوية الرقمية لكبار الشخصيات', 'VIP Digital ID',
  '/brand/logo.webp', '/brand/cover.webp', 'منصة الهوية الرقمية لكبار الشخصيات', 'VIP Digital ID platform',
  '{"theme":"gold-charcoal"}', 'active', 'user_c1', NULL, 1, NULL, NULL, NULL, 'system', (unixepoch() * 1000), 'user_c1', (unixepoch() * 1000)
);

INSERT OR IGNORE INTO users (
  id, permanent_id, tenant_id, name, email, phone, whatsapp, pin_hash, role, is_managed,
  managed_by_user_id, custody_transfer_email, custody_token_hash, custody_token_expires,
  referred_by_permanent_id, wallet_balance, status, failed_login_attempts, locked_until,
  terms_accepted_at, created_at
) VALUES (
  'user_c1', 'C1', 'tenant_main', 'مالك المنصة', 'rijalalwatan.com@gmail.com', NULL, '966555444959', NULL,
  'super_admin', 0, NULL, NULL, NULL, NULL, NULL, 0, 'active', 0, NULL, (unixepoch() * 1000), (unixepoch() * 1000)
);
