PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN pin_salt TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN pin_set_at INTEGER;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;
ALTER TABLE users ADD COLUMN privacy_accepted_at INTEGER;
ALTER TABLE users ADD COLUMN eligibility_acknowledged_at INTEGER;

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
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email_purpose ON auth_challenges(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_active ON trusted_devices(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_active ON auth_sessions(token_hash, expires_at);

UPDATE users
SET email_verified_at = created_at
WHERE status = 'active' AND email_verified_at IS NULL;

INSERT INTO system_settings (key, value, updated_at)
VALUES ('next_permanent_id_seq', '1', (unixepoch() * 1000))
ON CONFLICT(key) DO UPDATE SET
  value = CASE WHEN CAST(system_settings.value AS INTEGER) < 1 THEN '1' ELSE system_settings.value END,
  updated_at = excluded.updated_at;
