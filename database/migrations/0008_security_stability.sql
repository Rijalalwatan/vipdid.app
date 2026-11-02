-- Security/stability patch v1.1: active custom domains may be used only by one tenant.
ALTER TABLE tenants ADD COLUMN custom_domain TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain
  ON tenants(custom_domain COLLATE NOCASE)
  WHERE custom_domain IS NOT NULL;
