CREATE TABLE IF NOT EXISTS users (
    discord_user_id VARCHAR(32) PRIMARY KEY,
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_discord_id VARCHAR(32) NOT NULL REFERENCES users(discord_user_id),
    guild_id VARCHAR(32),
    channel_id VARCHAR(32),
    storage_key TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    public_id VARCHAR(16) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    delete_after TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    download_count INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER DEFAULT 100,
    storage_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_files_public_id ON files(public_id);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_discord_id);
CREATE INDEX IF NOT EXISTS idx_files_guild ON files(guild_id);
CREATE INDEX IF NOT EXISTS idx_files_cleanup ON files(delete_after) WHERE storage_deleted = FALSE;

CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    owner_discord_id VARCHAR(32) NOT NULL REFERENCES users(discord_user_id),
    guild_id VARCHAR(32),
    channel_id VARCHAR(32),
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    upload_id TEXT,
    storage_key TEXT,
    original_filename TEXT,
    expected_size_bytes BIGINT,
    requested_expiration_seconds INTEGER NOT NULL,
    max_downloads INTEGER DEFAULT 100,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_token ON upload_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS download_events (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS file_reports (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    reporter_ip_hash VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_reports_file ON file_reports(file_id);
