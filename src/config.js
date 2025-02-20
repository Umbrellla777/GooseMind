require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    RESPONSE_PROBABILITY: 0.1, // Вероятность автоматической генерации по умолчанию
    BOT_NAMES: [
        'ShizAI', 'шизик', 'шиз',
        'полуумный', 'гусь', 'полуумный гусь',
        'Полуумный', 'Гусь', 'Полуумный Гусь'
    ], // Варианты имен бота для упоминаний
    CONTEXT_MESSAGE_COUNT: 15,
    REACTION_PROBABILITY: 0.15, // Добавляем вероятность реакции
    REACTIONS: [
        '👍', '❤️', '🔥', '🥰', '👏',
        '🤔', '🤯', '😱', '🤬', '😢',
        '🎉', '🤩', '🤮', '💩', '🙏',
        '👎', '❤️‍🔥', '🤨', '🖕'
    ], // Список возможных реакций
    CACHE_LIFETIME: 30 * 60 * 1000, // 30 минут
    MAX_CACHE_SIZE: 1000, // максимальное количество слов в кэше
    MEMORY_CHECK_INTERVAL: 5 * 60 * 1000 // проверка памяти каждые 5 минут
}; 