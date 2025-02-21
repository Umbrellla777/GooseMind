-- Создаем перечисление для типов сообщений, если его еще нет
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
        CREATE TYPE message_type AS ENUM ('text', 'sticker', 'photo', 'video', 'voice', 'document');
    END IF;
END $$;

-- Удаляем старые таблицы, если они существуют
DROP TABLE IF EXISTS phrase_stats CASCADE;
DROP TABLE IF EXISTS phrases CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS chats CASCADE;

-- Таблица чатов
CREATE TABLE chats (
    id BIGINT PRIMARY KEY,
    title TEXT,
    type TEXT CHECK (type IN ('private', 'group', 'supergroup', 'channel')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица пользователей
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица сообщений
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    chat_id BIGINT REFERENCES chats(id),
    user_id BIGINT REFERENCES users(id),
    text TEXT,
    type message_type DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
);

-- Таблица фраз
CREATE TABLE phrases (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT REFERENCES chats(id),
    message_id INTEGER REFERENCES messages(id),
    phrase TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создаем индексы
DO $$ 
BEGIN
    -- Удаляем существующие индексы, если они есть
    DROP INDEX IF EXISTS idx_messages_chat_id;
    DROP INDEX IF EXISTS idx_messages_user_id;
    DROP INDEX IF EXISTS idx_phrases_chat_id;
    DROP INDEX IF EXISTS idx_messages_created_at;
    DROP INDEX IF EXISTS idx_phrases_created_at;
    
    -- Создаем индексы заново
    CREATE INDEX idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX idx_messages_user_id ON messages(user_id);
    CREATE INDEX idx_phrases_chat_id ON phrases(chat_id);
    CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
    CREATE INDEX idx_phrases_created_at ON phrases(created_at DESC);
END $$;

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Удаляем существующие триггеры, если они есть
DROP TRIGGER IF EXISTS update_chats_updated_at ON chats;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Создаем триггеры
CREATE TRIGGER update_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 