CREATE TABLE IF NOT EXISTS weeks (
  week_id TEXT PRIMARY KEY,
  active_version TEXT NOT NULL DEFAULT 'v7',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  week_id TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_week ON notes(week_id);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  category_key TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_cat ON topics(category_key);
