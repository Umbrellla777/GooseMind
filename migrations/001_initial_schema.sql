-- Создаем перечисление для типов сообщений
CREATE TYPE message_type AS ENUM ('text', 'sticker', 'photo', 'video', 'voice', 'document');

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
    reply_to_message_id BIGINT,
    type message_type DEFAULT 'text',
    text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
);

-- Таблица фраз (2-3 слова)
CREATE TABLE phrases (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT REFERENCES chats(id),
    phrase TEXT NOT NULL,
    message_id INTEGER REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Индекс для полнотекстового поиска
    phrase_vector tsvector GENERATED ALWAYS AS (to_tsvector('russian', phrase)) STORED
);

-- Таблица статистики использования фраз
CREATE TABLE phrase_stats (
    id SERIAL PRIMARY KEY,
    phrase_id INTEGER REFERENCES phrases(id),
    chat_id BIGINT REFERENCES chats(id),
    used_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создаем индексы
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_phrases_chat_id ON phrases(chat_id);
CREATE INDEX idx_phrase_stats_chat_id ON phrase_stats(chat_id);
CREATE INDEX idx_phrases_phrase_vector ON phrases USING gin(phrase_vector);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Функция для обновления статистики использования фраз
CREATE OR REPLACE FUNCTION update_phrase_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO phrase_stats (phrase_id, chat_id, used_count, last_used_at)
    VALUES (NEW.id, NEW.chat_id, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (phrase_id, chat_id) 
    DO UPDATE SET 
        used_count = phrase_stats.used_count + 1,
        last_used_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_phrase_stats_trigger
    AFTER INSERT ON phrases
    FOR EACH ROW
    EXECUTE FUNCTION update_phrase_stats();

-- Индексы для поиска
CREATE INDEX idx_phrases_created_at ON phrases(created_at DESC);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC); 