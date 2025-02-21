const config = require('../config');

// Константы для реакций
const REACTIONS = {
    POSITIVE: ['👍', '❤️', '🔥', '🥰', '👏'],
    NEGATIVE: ['👎', '💩'],
    FUNNY: ['🤣', '😂'],
    THINKING: ['🤔'],
    SURPRISED: ['😱'],
    RANDOM: ['🦆', '❤️‍🔥', '🤨', '🖕']
};

class MessageHandler {
    constructor(supabase) {
        this.supabase = supabase;
    }

    async saveMessage(message) {
        const words = this.parseMessage(message.text);
        
        // Сохраняем сообщение
        await this.supabase
            .from('messages')
            .insert({
                message_id: message.message_id,
                chat_id: message.chat.id,
                user_id: message.from.id,
                text: message.text,
                timestamp: new Date(message.date * 1000),
                words: words
            });
            
        // Сохраняем слова и их контекст
        for (const word of words) {
            await this.supabase
                .from('words')
                .insert({
                    word: word.toLowerCase(),
                    message_id: message.message_id,
                    context: words.join(' ')
                });
        }
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
            (name.toLowerCase() === 'полуумный гусь' && 
             lowerText.includes('полуумный') && 
             lowerText.includes('гусь'))
        );
    }

    async clearDatabase() {
        await this.supabase.from('messages').delete().neq('id', 0);
        await this.supabase.from('words').delete().neq('id', 0);
    }

    async analyzeForReaction(message) {
        try {
            // Не реагируем на сообщения бота
            if (message.from.id === message.botInfo?.id) {
                return null;
            }

            // Анализируем текст сообщения
            const text = message.text.toLowerCase();
            const words = this.parseMessage(text);

            // Выбираем тип реакции на основе анализа
            let reactionType = this.selectReactionType(text, words);

            // Используем базовую вероятность для всех сообщений
            return this.getRandomReaction(reactionType);
        } catch (error) {
            console.error('Error analyzing for reaction:', error);
            return null;
        }
    }

    selectReactionType(text, words) {
        // Позитивные слова
        const positiveWords = ['круто', 'класс', 'супер', 'отлично', 'хорошо', 'да', 'согласен'];
        // Негативные слова
        const negativeWords = ['плохо', 'ужас', 'отстой', 'нет', 'не согласен'];
        // Смешные слова
        const funnyWords = ['ахах', 'хах', 'лол', 'кек', 'смешно', 'ржака'];
        // Думающие слова
        const thinkingWords = ['думаю', 'полагаю', 'кажется', 'возможно', 'наверное'];

        // Проверяем наличие слов в тексте
        if (words.some(word => funnyWords.includes(word))) return 'FUNNY';
        if (words.some(word => positiveWords.includes(word))) return 'POSITIVE';
        if (words.some(word => negativeWords.includes(word))) return 'NEGATIVE';
        if (words.some(word => thinkingWords.includes(word))) return 'THINKING';
        
        // Если не нашли специальных слов, возвращаем случайный тип
        const types = ['POSITIVE', 'RANDOM']; // Чаще используем позитивные реакции
        return types[Math.floor(Math.random() * types.length)];
    }

    getRandomReaction(type) {
        // Используем настраиваемую вероятность напрямую
        if (Math.random() > config.REACTION_PROBABILITY) return null;

        const reactions = REACTIONS[type];
        if (!reactions) return null;

        // Иногда добавляем случайную реакцию из RANDOM
        if (Math.random() < 0.2) { // 20% шанс добавить случайную реакцию
            return [
                reactions[Math.floor(Math.random() * reactions.length)],
                REACTIONS.RANDOM[Math.floor(Math.random() * REACTIONS.RANDOM.length)]
            ];
        }

        return [reactions[Math.floor(Math.random() * reactions.length)]];
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
}

module.exports = { MessageHandler }; 