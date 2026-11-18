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
  custom_domain TEXT COLLATE NOCASE,
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
  approved_at INTEGER,
  tenant_type TEXT NOT NULL DEFAULT 'main' CHECK(tenant_type IN ('main', 'partner')),
  requested_at INTEGER,
  request_reason TEXT,
  updated_at INTEGER
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
  pin_salt TEXT,
  email_verified_at INTEGER,
  pin_set_at INTEGER,
  last_login_at INTEGER,
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
  privacy_accepted_at INTEGER,
  eligibility_acknowledged_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  draft_slug TEXT,
  published_contact_json TEXT,
  privacy_hidden INTEGER NOT NULL DEFAULT 0 CHECK(privacy_hidden IN (0,1)),
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
  submission_locale TEXT NOT NULL DEFAULT 'ar' CHECK(submission_locale IN ('ar', 'en')),
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  submitted_slug TEXT,
  submitted_contact_json TEXT
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

CREATE TABLE IF NOT EXISTS point_entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  active_days INTEGER NOT NULL DEFAULT 0 CHECK(active_days >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS point_grant_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
  request_reason TEXT NOT NULL,
  grant_category TEXT CHECK(grant_category IN ('seasonal', 'exceptional', 'activity')),
  awarded_amount INTEGER CHECK(awarded_amount IS NULL OR awarded_amount > 0),
  reviewer_id TEXT REFERENCES users(id),
  reviewer_reason TEXT,
  requested_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT REFERENCES publish_requests(id),
  kind TEXT NOT NULL CHECK(kind IN ('publication_approved', 'publication_changes_requested', 'publication_rejected')),
  locale TEXT NOT NULL CHECK(locale IN ('ar', 'en')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custody_invitations (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('user', 'tenant')),
  subject_user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
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

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK(purpose IN ('registration', 'login', 'owner_setup')),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('ar', 'en')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 6 CHECK(max_attempts BETWEEN 1 AND 10),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  requested_ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  trusted_device_id TEXT REFERENCES trusted_devices(id),
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  mfa_verified_at INTEGER,
  mfa_version INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referred_by_permanent_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_slug ON profiles(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_tenants_type_status ON tenants(tenant_type, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain ON tenants(custom_domain COLLATE NOCASE) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custody_invitations_subject ON custody_invitations(subject_type, subject_user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_custody_invitations_email ON custody_invitations(recipient_email, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_actor_created ON ledger_entries(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grant_requests_user_created ON point_grant_requests(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_grant_requests_status_created ON point_grant_requests(status, requested_at ASC);
CREATE INDEX IF NOT EXISTS idx_publish_requests_tenant_status ON publish_requests(tenant_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_publish_requests_profile_status ON publish_requests(profile_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_profile ON media_assets(profile_id, category);
CREATE INDEX IF NOT EXISTS idx_media_assets_user_category ON media_assets(user_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_email_purpose ON auth_challenges(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_active ON trusted_devices(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_active ON auth_sessions(token_hash, expires_at);

-- Required-gap repair operational tables (migration 0009).
CREATE TABLE IF NOT EXISTS atomic_operations (
  key TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK(valid = 1),
  actor_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS security_counters (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS moderator_assignments (
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  assigned_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, tenant_id)
);
INSERT OR IGNORE INTO moderator_assignments(user_id, tenant_id, assigned_by, created_at)
SELECT assigned_moderator_id, id, created_by, created_at FROM tenants WHERE assigned_moderator_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS admin_mfa (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  secret_cipher TEXT,
  pending_cipher TEXT,
  pending_expires_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  last_step INTEGER NOT NULL DEFAULT -1,
  enrolled_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  consumed_at INTEGER,
  PRIMARY KEY(user_id, code_hash)
);
CREATE TABLE IF NOT EXISTS consent_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK(kind IN ('copy','correction','withdrawal','deletion')),
  status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','extended','rejected')),
  details TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT,
  response_note TEXT,
  requested_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  completed_at INTEGER,
  extended_at INTEGER,
  legal_hold_reason TEXT
);
CREATE TABLE IF NOT EXISTS deletion_tombstones (
  subject_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  retained_reason TEXT,
  deleted_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  payload_cipher TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS operational_incidents (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','acknowledged','resolved')),
  detected_at INTEGER NOT NULL,
  controller_aware_at INTEGER,
  acknowledged_by TEXT,
  summary TEXT NOT NULL,
  actions TEXT,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  object_key TEXT,
  bookmark TEXT,
  metadata_json TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_one_pending ON publish_requests(profile_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_one_pending ON point_grant_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_privacy_due ON privacy_requests(status, due_at);
CREATE INDEX IF NOT EXISTS idx_outbox_retry ON delivery_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_security_expiry ON security_counters(expires_at);

CREATE TABLE IF NOT EXISTS contact_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  challenge_id TEXT NOT NULL REFERENCES auth_challenges(id),
  new_email TEXT NOT NULL,
  payload_cipher TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
