const config = require('../config');
const { MessageGenerator } = require('../services/messageGenerator');

// Константы для реакций
const REACTIONS = {
    POSITIVE: ['👍', '❤️', '🔥', '🥰', '👏'],
    NEGATIVE: ['👎', '💩', '🤮'],
    FUNNY: ['🤣', '😂'],
    THINKING: ['🤔'],
    SURPRISED: ['😱', '🤯'],
    RANDOM: ['🦆', '❤️‍🔥', '🤨', '🖕', '💩']
};

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

            // Сразу проверяем вероятность реакции
            if (Math.random() * 100 >= config.REACTION_PROBABILITY) {
                return null;
            }

            // Анализируем текст сообщения
            const text = message.text.toLowerCase();
            const words = this.parseMessage(text);

            // Выбираем тип реакции на основе анализа
            let reactionType = this.selectReactionType(text, words);

            // Возвращаем реакцию
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
        const negativeWords = ['плохо', 'ужас', 'отстой', 'нет', 'не согласен', 'говно', 'дерьмо', 'хрень'];
        // Смешные слова
        const funnyWords = ['ахах', 'хах', 'лол', 'кек', 'смешно', 'ржака'];
        // Думающие слова
        const thinkingWords = ['думаю', 'полагаю', 'кажется', 'возможно', 'наверное'];

        // Проверяем наличие слов в тексте
        if (words.some(word => negativeWords.includes(word))) return 'NEGATIVE';
        if (words.some(word => funnyWords.includes(word))) return 'FUNNY';
        if (words.some(word => positiveWords.includes(word))) return 'POSITIVE';
        if (words.some(word => thinkingWords.includes(word))) return 'THINKING';
        
        // Если не нашли специальных слов, возвращаем случайный тип с большим шансом на RANDOM
        const types = ['POSITIVE', 'NEGATIVE', 'RANDOM', 'RANDOM', 'RANDOM']; // Увеличили шанс случайных реакций
        return types[Math.floor(Math.random() * types.length)];
    }

    getRandomReaction(type) {
        const reactions = REACTIONS[type];
        if (!reactions) return null;

        // Увеличим шанс на дополнительную реакцию
        if (Math.random() < 0.3) { // 30% шанс добавить случайную реакцию
            const mainReaction = reactions[Math.floor(Math.random() * reactions.length)];
            const extraReaction = Math.random() < 0.5 ? '💩' : REACTIONS.RANDOM[Math.floor(Math.random() * REACTIONS.RANDOM.length)];
            return [mainReaction, extraReaction];
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