PRAGMA foreign_keys = ON;
ALTER TABLE publish_requests ADD COLUMN submission_locale TEXT NOT NULL DEFAULT 'ar' CHECK(submission_locale IN ('ar', 'en'));
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
CREATE INDEX IF NOT EXISTS idx_publish_requests_profile_status ON publish_requests(profile_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
