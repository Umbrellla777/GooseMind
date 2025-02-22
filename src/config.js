require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    RESPONSE_PROBABILITY: 10, // Вероятность автоматической генерации (10%)
    REACTION_PROBABILITY: 15, // Вероятность реакции (15%)
    CHARACTER_TYPE: 'normal', // 'peaceful', 'normal', 'sarcastic', 'aggressive'
    CHARACTER_SETTINGS: {
        peaceful: {
            name: 'Мирный',
            swearProbability: 0,
            traits: [
                'Дружелюбный и спокойный',
                'Любит пошутить беззлобно',
                'Старается помочь',
                'Избегает конфликтов',
                'Использует много эмодзи'
            ]
        },
        normal: {
            name: 'Обычный',
            swearProbability: 5,
            traits: [
                'Саркастичный и ироничный',
                'Считаешь себя умнее всех',
                'Любишь подкалывать собеседников',
                'Отвечаешь с юмором, но по делу',
                'Используешь современный сленг'
            ]
        },
        sarcastic: {
            name: 'Саркастичный',
            swearProbability: 15,
            traits: [
                'Очень саркастичный',
                'Постоянно иронизируешь',
                'Любишь острые шутки',
                'Подкалываешь всех подряд',
                'Считаешь себя самым умным'
            ]
        },
        aggressive: {
            name: 'Агрессивный',
            swearProbability: 30,
            traits: [
                'Агрессивно настроен',
                'Постоянно огрызаешься',
                'Любишь жесткие шутки',
                'Провоцируешь конфликты',
                'Используешь грубый сленг'
            ]
        }
    },
    BOT_NAMES: [
        'Гусь', 'Гуся', 'гуся',
        'полумный', 'гусь', 'полумный гусь',
        'Полумный гусь'
    ], // Варианты имен бота для упоминаний
    CONTEXT_MESSAGE_COUNT: 15,
    REACTIONS: [
        '👍', '❤️', '🔥', '🥰', '👏',
        '🤔', '🤯', '😱', '🤬', '😢',
        '🎉', '🤩', '🤮', '💩', '🙏',
        '👎', '❤️‍🔥', '🤨', '🖕',
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