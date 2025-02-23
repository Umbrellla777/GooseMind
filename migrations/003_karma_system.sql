CREATE TABLE chat_karma (
    chat_id BIGINT PRIMARY KEY REFERENCES chats(id),
    karma_value INTEGER DEFAULT 0,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT karma_range CHECK (karma_value >= -1000 AND karma_value <= 1000)
);

CREATE INDEX idx_chat_karma_value ON chat_karma(karma_value); 