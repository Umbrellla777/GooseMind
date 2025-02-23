-- Создаем таблицу для хранения кармы чатов
CREATE TABLE IF NOT EXISTS chat_karma (
    chat_id BIGINT PRIMARY KEY REFERENCES chats(id),
    karma_value INTEGER DEFAULT 0 CHECK (karma_value >= -1000 AND karma_value <= 1000),
    last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индекс для быстрого поиска по chat_id
CREATE INDEX IF NOT EXISTS idx_chat_karma_chat_id ON chat_karma(chat_id); 