CREATE OR REPLACE FUNCTION save_message_with_phrases(
    p_message_id BIGINT,
    p_chat_id BIGINT,
    p_chat_title TEXT,
    p_chat_type TEXT,
    p_user_id BIGINT,
    p_username TEXT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_reply_to_message_id BIGINT,
    p_text TEXT,
    p_message_type message_type
) RETURNS TABLE (message_id INTEGER) AS $$
DECLARE
    v_chat_id BIGINT;
    v_user_id BIGINT;
    v_message_id INTEGER;
    v_word TEXT;
    v_words TEXT[];
    v_phrase TEXT;
BEGIN
    -- Сохраняем или обновляем информацию о чате
    INSERT INTO chats (id, title, type)
    VALUES (p_chat_id, p_chat_title, p_chat_type)
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        type = EXCLUDED.type,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_chat_id;

    -- Сохраняем или обновляем информацию о пользователе
    INSERT INTO users (id, username, first_name, last_name)
    VALUES (p_user_id, p_username, p_first_name, p_last_name)
    ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_user_id;

    -- Сохраняем сообщение
    INSERT INTO messages (message_id, chat_id, user_id, reply_to_message_id, text, type)
    VALUES (p_message_id, v_chat_id, v_user_id, p_reply_to_message_id, p_text, p_message_type)
    RETURNING id INTO v_message_id;

    -- Разбиваем текст на слова
    v_words := regexp_split_to_array(lower(p_text), '\s+');

    -- Создаем фразы по 2-3 слова
    FOR i IN 1..array_length(v_words, 1)-1 LOOP
        -- Фраза из 2 слов
        v_phrase := v_words[i] || ' ' || v_words[i+1];
        INSERT INTO phrases (chat_id, phrase, message_id)
        VALUES (v_chat_id, v_phrase, v_message_id);

        -- Фраза из 3 слов
        IF i < array_length(v_words, 1)-1 THEN
            v_phrase := v_words[i] || ' ' || v_words[i+1] || ' ' || v_words[i+2];
            INSERT INTO phrases (chat_id, phrase, message_id)
            VALUES (v_chat_id, v_phrase, v_message_id);
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_message_id;
END;
$$ LANGUAGE plpgsql; 