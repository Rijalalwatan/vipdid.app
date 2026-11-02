PRAGMA foreign_keys = ON;

ALTER TABLE tenants ADD COLUMN tenant_type TEXT NOT NULL DEFAULT 'main' CHECK(tenant_type IN ('main', 'partner'));
ALTER TABLE tenants ADD COLUMN requested_at INTEGER;
ALTER TABLE tenants ADD COLUMN request_reason TEXT;
ALTER TABLE tenants ADD COLUMN updated_at INTEGER;

UPDATE tenants SET tenant_type = 'main', updated_at = COALESCE(updated_at, created_at) WHERE id = 'tenant_main';

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

DROP INDEX IF EXISTS idx_profiles_slug_global;
CREATE INDEX IF NOT EXISTS idx_tenants_type_status ON tenants(tenant_type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_custody_invitations_subject ON custody_invitations(subject_type, subject_user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_custody_invitations_email ON custody_invitations(recipient_email, status, expires_at);
