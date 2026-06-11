-- Settings table for password storage and other app config
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert default password hash if not exists (will be overridden when user sets a custom password)
INSERT INTO settings (key, value)
VALUES ('password_updated_at', 'never')
ON CONFLICT (key) DO NOTHING;
