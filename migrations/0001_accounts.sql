PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS account_users (
 id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_identities (
 provider TEXT NOT NULL CHECK(provider IN ('google','github')), subject TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES account_users(id), email TEXT,
 PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_oauth_states (
 state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
 return_to TEXT NOT NULL, link_user TEXT, link_session TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_oauth_expiry ON account_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS account_rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_rate_expiry ON account_rate_limits(expires_at);
