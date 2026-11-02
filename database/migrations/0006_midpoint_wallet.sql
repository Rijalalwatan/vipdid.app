PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referred_by_permanent_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_actor_created ON ledger_entries(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grant_requests_user_created ON point_grant_requests(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_grant_requests_status_created ON point_grant_requests(status, requested_at ASC);
