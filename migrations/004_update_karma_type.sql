-- Изменяем тип колонки karma_value на DECIMAL
ALTER TABLE chat_karma 
    ALTER COLUMN karma_value TYPE DECIMAL(10,1),
    ALTER COLUMN karma_value SET DEFAULT 0;

-- Обновляем ограничение
ALTER TABLE chat_karma 
    DROP CONSTRAINT IF EXISTS chat_karma_karma_value_check,
    ADD CONSTRAINT chat_karma_karma_value_check 
        CHECK (karma_value >= -1000 AND karma_value <= 1000); 