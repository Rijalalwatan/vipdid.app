-- Additive and compatible with the previous Worker. No balance/identity changes.
ALTER TABLE profiles ADD COLUMN draft_slug TEXT;
ALTER TABLE profiles ADD COLUMN published_contact_json TEXT;
ALTER TABLE profiles ADD COLUMN privacy_hidden INTEGER NOT NULL DEFAULT 0 CHECK(privacy_hidden IN (0,1));
UPDATE profiles SET draft_slug = slug WHERE draft_slug IS NULL;
UPDATE profiles SET published_contact_json = (SELECT json_object('email', u.email, 'phone', COALESCE(u.phone,''), 'whatsapp', COALESCE(u.whatsapp,'')) FROM users u WHERE u.id = profiles.user_id) WHERE is_published = 1 AND published_contact_json IS NULL;
ALTER TABLE publish_requests ADD COLUMN submitted_slug TEXT;
ALTER TABLE publish_requests ADD COLUMN submitted_contact_json TEXT;
UPDATE publish_requests SET submitted_slug = (SELECT p.slug FROM profiles p WHERE p.id = publish_requests.profile_id) WHERE submitted_slug IS NULL;
ALTER TABLE auth_sessions ADD COLUMN mfa_verified_at INTEGER;
ALTER TABLE auth_sessions ADD COLUMN mfa_version INTEGER NOT NULL DEFAULT 0;

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
