-- Additive and idempotent; also safe on databases initialized before migrations.
CREATE TABLE IF NOT EXISTS account_sync_changes (
 revision INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES account_users(id),
 operation_id TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL,
 present INTEGER NOT NULL CHECK(present IN (0,1)),
 UNIQUE(user_id,operation_id)
);
CREATE TABLE IF NOT EXISTS account_sync_items (
 user_id TEXT NOT NULL REFERENCES account_users(id), kind TEXT NOT NULL,
 item TEXT NOT NULL, present INTEGER NOT NULL CHECK(present IN (0,1)),
 revision INTEGER NOT NULL, PRIMARY KEY(user_id,kind,item)
);
CREATE INDEX IF NOT EXISTS account_sync_cursor ON account_sync_items(user_id,revision);
