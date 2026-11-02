PRAGMA foreign_keys = ON;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug_global ON profiles(slug);
CREATE INDEX IF NOT EXISTS idx_media_assets_user_category ON media_assets(user_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_profile_created ON media_assets(profile_id, created_at);
