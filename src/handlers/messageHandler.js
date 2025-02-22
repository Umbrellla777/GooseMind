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

    async getCurrentKarma(chatId) {
        const { data } = await this.supabase
            .from('chat_karma')
            .select('karma')
            .eq('chat_id', chatId)
            .single();
        return data?.karma || 0;
    }

    async setKarma(chatId, karma) {
        const oldKarma = await this.getCurrentKarma(chatId);
        await this.supabase
            .from('chat_karma')
            .upsert({ chat_id: chatId, karma: karma });

        // Уведомляем только при изменении сотен
        const oldHundreds = Math.floor(oldKarma / 100);
        const newHundreds = Math.floor(karma / 100);
        
        if (oldHundreds !== newHundreds) {
            const change = karma > oldKarma ? 'повысилась' : 'понизилась';
            const character = this.getCharacterByKarma(karma);
            return {
                notify: true,
                message: `🎭 Карма ${change} до ${karma}!\nТекущий характер: ${character.name}`
            };
        }
        
        return { notify: false };
    }

    getCharacterByKarma(karma) {
        if (karma >= 900) return config.CHARACTER_SETTINGS.divine;
        if (karma >= 800) return config.CHARACTER_SETTINGS.angelic;
        if (karma >= 700) return config.CHARACTER_SETTINGS.saint;
        if (karma >= 600) return config.CHARACTER_SETTINGS.blessed;
        if (karma >= 500) return config.CHARACTER_SETTINGS.enlightened;
        if (karma >= 400) return config.CHARACTER_SETTINGS.cheerful;
        if (karma >= 300) return config.CHARACTER_SETTINGS.friendly;
        if (karma >= 200) return config.CHARACTER_SETTINGS.peaceful;
        if (karma >= 100) return config.CHARACTER_SETTINGS.positive;
        if (karma >= 0) return config.CHARACTER_SETTINGS.normal;
        if (karma >= -100) return config.CHARACTER_SETTINGS.grumpy;
        if (karma >= -200) return config.CHARACTER_SETTINGS.sarcastic;
        if (karma >= -300) return config.CHARACTER_SETTINGS.annoyed;
        if (karma >= -400) return config.CHARACTER_SETTINGS.irritated;
        if (karma >= -500) return config.CHARACTER_SETTINGS.angry;
        if (karma >= -600) return config.CHARACTER_SETTINGS.aggressive;
        if (karma >= -700) return config.CHARACTER_SETTINGS.furious;
        if (karma >= -800) return config.CHARACTER_SETTINGS.hostile;
        if (karma >= -900) return config.CHARACTER_SETTINGS.cruel;
        return config.CHARACTER_SETTINGS.demonic;
    }
}

module.exports = { MessageHandler }; 