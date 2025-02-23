const config = require('../config');
const { MessageGenerator } = require('../services/messageGenerator');

// Упрощаем список реакций до одного массива
const REACTIONS = [
    '👍', '❤️', '🔥', '🥰', '👏',
    '🤔', '🤯', '😱', '🤬', '😢',
    '🎉', '🤩', '🤮', '💩', '🙏',
    '👎', '❤️‍🔥', '🤨', '🖕', 
    '💩', '💩', '💩'  // Увеличиваем шанс на 💩, добавляя его несколько раз
];

class MessageHandler {
    constructor(supabase) {
        this.supabase = supabase;
        this.messageGenerator = new MessageGenerator(supabase);
    }

    async saveMessage(message) {
        return await this.messageGenerator.saveMessage(message);
    }

    async saveMessageDirect(message) {
        return await this.messageGenerator.saveMessageDirect(message);
    }

    parseMessage(text) {
        return text
            .toLowerCase()
            .replace(/[^\wа-яё\s]/gi, '')
            .split(/\s+/)
            .filter(word => word.length > 0);
    }

    isBotMentioned(text) {
        const lowerText = text.toLowerCase();
        return config.BOT_NAMES.some(name => 
            lowerText.includes(name.toLowerCase()) ||
            // Добавляем проверку для составных имен
            (name.toLowerCase() === 'полоумный гусь' && 
             lowerText.includes('полоумный') && 
             lowerText.includes('гусь'))
        );
    }

    async clearDatabase() {
        await this.supabase.from('messages').delete().neq('id', 0);
        await this.supabase.from('words').delete().neq('id', 0);
    }

    async analyzeForReaction(message) {
        try {
            if (message.from?.id === message.botInfo?.id) {
                return null;
            }

            if (Math.random() * 100 >= config.REACTION_PROBABILITY) {
                return null;
            }

            return [REACTIONS[Math.floor(Math.random() * REACTIONS.length)]];
        } catch (error) {
            console.error('Error analyzing for reaction:', error);
            return null;
        }
    }

    async checkDatabaseContent(chatId) {
        try {
            // Получаем количество сообщений для конкретного чата
            const { data: messages } = await this.supabase
                .from('messages')
                .select('id')
                .eq('chat_id', chatId);

            // Получаем количество всех слов
            const { data: words } = await this.supabase
                .from('words')
                .select('id');

            const messagesCount = messages?.length || 0;
            const wordsCount = words?.length || 0;

            console.log(`База данных для чата ${chatId}:`);
            console.log(`- Сообщений: ${messagesCount}`);
            console.log(`- Всего слов: ${wordsCount}`);

            return {
                messages: messagesCount,
                words: wordsCount
            };
        } catch (error) {
            console.error('Ошибка при проверке базы данных:', error);
            return null;
        }
    }

    async analyzeMessageForKarma(message) {
        if (!message?.text) return 0;
        const text = message.text.toLowerCase();

        let karmaChange = 0;
        const MAX_NEGATIVE_CHANGE = -1;
        const MAX_POSITIVE_CHANGE = 0.7;

        // Паттерны для снижения кармы
        const badPatterns = [
            // Оскорбления и агрессия
            /(дур[ао]к|идиот|тупой|мудак|козел|придурок)/i,
            /(пош[её]л ты|иди на|вали отсюда)/i,
            // Маты и ругательства
            /(бля|хуй|пизд|еб[ао]|сук[аи]|хер)/i,
            // Негативные эмоции
            /(ненавижу|бесит|достал|заебал)/i,
            // Спам и флуд
            /(.)\1{4,}/,  // Повторяющиеся символы
            /(.)(?:\1|\s){10,}/  // Длинные последовательности
        ];

        // Паттерны для повышения кармы
        const goodPatterns = [
            // Благодарность и вежливость
            /(спасибо|благодарю|пожалуйста|будьте добры)/i,
            // Позитивные оценки
            /(круто|классно|здорово|отлично|супер)/i,
            // Конструктивные фразы
            /(предлагаю|давайте|помог|полезно)/i,
            // Поддержка и эмпатия
            /(понимаю|сочувствую|поддерживаю|согласен)/i,
            // Приветствия и прощания
            /(здравствуйте|доброе|привет|до свидания|всего доброго)/i
        ];

        // Проверяем негативные паттерны
        for (const pattern of badPatterns) {
            if (pattern.test(text)) {
                // Более серьезные нарушения снижают карму сильнее
                if (pattern.source.includes('бля|хуй|пизд')) {
                    karmaChange -= (Math.random() * 0.3) + 0.4; // -0.4 до -0.7
                } else {
                    karmaChange -= (Math.random() * 0.2) + 0.1; // -0.1 до -0.3
                }
            }
        }

        // Проверяем позитивные паттерны
        for (const pattern of goodPatterns) {
            if (pattern.test(text)) {
                if (pattern.source.includes('спасибо|благодарю')) {
                    karmaChange += (Math.random() * 0.2) + 0.2; // +0.2 до +0.4
                } else {
                    karmaChange += 0.1; // +0.1
                }
            }
        }

        // Дополнительные проверки
        if (text.length > 200) {
            // Длинные осмысленные сообщения немного повышают карму
            karmaChange += 0.1;
        }

        if (/^[А-ЯA-Z\s]+$/.test(text)) {
            // Капс снижает карму
            karmaChange -= 0.2;
        }

        // Проверка на повторяющиеся сообщения
        const recentMessages = await this.getRecentMessages(message.chat.id, 5);
        if (recentMessages.some(msg => msg.text === message.text)) {
            karmaChange -= 0.3; // Штраф за повторы
        }

        // Применяем ограничения на изменение кармы
        if (karmaChange < 0) {
            return Math.max(MAX_NEGATIVE_CHANGE, karmaChange);
        } else {
            return Math.min(MAX_POSITIVE_CHANGE, karmaChange);
        }
    }

    async getRecentMessages(chatId, limit = 5) {
        try {
            const { data: messages } = await this.supabase
                .from('messages')
                .select('text')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);
            return messages || [];
        } catch (error) {
            console.error('Error getting recent messages:', error);
            return [];
        }
    }

    async updateKarmaForMessage(message) {
        if (!message?.chat?.id) return null;

        const karmaChange = await this.analyzeMessageForKarma(message);
        if (karmaChange === 0) return null;

        const { data: currentKarma } = await this.supabase
            .from('chat_karma')
            .select('karma_value')
            .eq('chat_id', message.chat.id)
            .single();

        const newKarma = Math.max(-1000, Math.min(1000, (currentKarma?.karma_value || 0) + karmaChange));

        await this.supabase
            .from('chat_karma')
            .upsert({
                chat_id: message.chat.id,
                karma_value: newKarma,
                last_update: new Date().toISOString()
            });

        return { oldKarma: currentKarma?.karma_value || 0, newKarma };
    }
}

module.exports = { MessageHandler }; 