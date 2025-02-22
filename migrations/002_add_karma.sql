CREATE TABLE IF NOT EXISTS chat_karma (
    chat_id BIGINT PRIMARY KEY,
    karma INTEGER DEFAULT 0,
    character_type VARCHAR(50) DEFAULT 'normal',
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT karma_range CHECK (karma >= -1000 AND karma <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_chat_karma_chat_id ON chat_karma(chat_id); 