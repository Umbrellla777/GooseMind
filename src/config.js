require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    RESPONSE_PROBABILITY: 0.1, // Вероятность автоматической генерации по умолчанию
    BOT_NAMES: [
        'Гусь', 'Гуся', 'гуся',
        'полумный', 'гусь', 'полумный гусь',
        'Полумный гусь'
    ], // Варианты имен бота для упоминаний
    CONTEXT_MESSAGE_COUNT: 15,
    REACTION_PROBABILITY: 0.15, // Добавляем вероятность реакции
    REACTIONS: [
        '👍', '❤️', '🔥', '🥰', '👏',
        '🤔', '🤯', '😱', '🤬', '😢',
        '🎉', '🤩', '🤮', '💩', '🙏',
        '👎', '❤️‍🔥', '🤨', '🖕'
    ], // Список возможных реакций
    MAX_RESPONSE_LENGTH: 100, // Максимальная длина ответа
    MIN_WORD_LENGTH: 2, // Минимальная длина слова для обработки
    CONTEXT_TIMEOUT: 5 * 60 * 1000, // Время жизни контекста (5 минут)
    RESPONSE_TEMPLATES: {
        GREETING: [
            'Привет!',
            'Здравствуйте!',
            'Рад вас видеть!'
        ],
        CONFUSION: [
            'Не совсем понимаю...',
            'Можете пояснить?',
            'Хм, интересно...'
        ],
        FALLBACK: [
            'Давайте поговорим об этом подробнее',
            'Интересная тема!',
            'А что вы думаете об этом?'
        ]
    },
    GEMINI: {
        API_KEY: process.env.GEMINI_API_KEY,
        MODEL: 'gemini-2.0-flash'
    },
    DOH_SERVER: process.env.DOH_SERVER
}; 