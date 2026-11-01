PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  logo_url TEXT,
  cover_url TEXT,
  description_ar TEXT,
  description_en TEXT,
  theme_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'suspended')),
  owner_user_id TEXT,
  assigned_moderator_id TEXT,
  is_managed_by_admin INTEGER NOT NULL DEFAULT 1 CHECK(is_managed_by_admin IN (0, 1)),
  custody_transfer_email TEXT,
  custody_token_hash TEXT,
  custody_token_expires INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  permanent_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  whatsapp TEXT,
  pin_hash TEXT,
  role TEXT NOT NULL CHECK(role IN ('user', 'moderator', 'adheed', 'super_admin')),
  is_managed INTEGER NOT NULL DEFAULT 0 CHECK(is_managed IN (0, 1)),
  managed_by_user_id TEXT REFERENCES users(id),
  custody_transfer_email TEXT,
  custody_token_hash TEXT,
  custody_token_expires INTEGER,
  referred_by_permanent_id TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 0 CHECK(wallet_balance >= 0),
  status TEXT NOT NULL CHECK(status IN ('pending_verification', 'active', 'suspended')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_login_attempts >= 0),
  locked_until INTEGER,
  terms_accepted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0, 1)),
  published_version_id TEXT,
  draft_json TEXT NOT NULL,
  published_json TEXT,
  allow_search_indexing INTEGER NOT NULL DEFAULT 1 CHECK(allow_search_indexing IN (0, 1)),
  active_days_balance INTEGER NOT NULL DEFAULT 0 CHECK(active_days_balance >= 0),
  featured_until INTEGER,
  storage_used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(storage_used_bytes >= 0),
  images_count INTEGER NOT NULL DEFAULT 0 CHECK(images_count >= 0),
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS publish_requests (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  submitted_payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'changes_requested', 'rejected')),
  reviewer_id TEXT REFERENCES users(id),
  review_note TEXT,
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  category TEXT NOT NULL CHECK(category IN ('avatar', 'cover', 'skill', 'portfolio')),
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  tx_type TEXT NOT NULL,
  metadata_json TEXT,
  actor_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_slug ON profiles(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_publish_requests_tenant_status ON publish_requests(tenant_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_profile ON media_assets(profile_id, category);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs(tenant_id, created_at);
