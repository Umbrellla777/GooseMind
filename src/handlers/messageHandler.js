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
        try {
            console.log('Начало очистки базы данных...');
            
            // Очищаем таблицы в правильном порядке (из-за внешних ключей)
            await this.supabase.from('phrases').delete();
            console.log('Очищена таблица phrases');
            
            await this.supabase.from('messages').delete();
            console.log('Очищена таблица messages');
            
            await this.supabase.from('chat_karma').delete();
            console.log('Очищена таблица chat_karma');
            
            // Очищаем таблицы пользователей и чатов
            await this.supabase.from('users').delete();
            console.log('Очищена таблица users');
            
            await this.supabase.from('chats').delete();
            console.log('Очищена таблица chats');
            
            // Сбрасываем кэш кармы
            if (this.karmaService) {
                this.karmaService.karmaCache.clear();
            }
            
            console.log('База данных успешно очищена');
            return true;
        } catch (error) {
            console.error('Ошибка при очистке базы данных:', error);
            throw error;
        }
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
}

module.exports = { MessageHandler }; 