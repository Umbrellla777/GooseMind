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

        // Проверяем, адресовано ли сообщение гусю
        const isDirectedToGoose = config.BOT_NAMES.some(name => 
            text.includes(name.toLowerCase())
        );

        // Функция для проверки наличия паттернов в тексте
        const hasPatterns = (patterns) => {
            return patterns.some(pattern => pattern.test(text));
        };

        let karmaChange = 0;
        const MAX_NEGATIVE_CHANGE = -1;
        const MAX_POSITIVE_CHANGE = 0.7;

        // Коэффициент влияния на карму
        const karmaMultiplier = isDirectedToGoose ? 1 : 0.3;

        // Разделяем паттерны по уровням влияния
        const karmaPatterns = {
            veryPositive: [
                /(спасибо|благодар)/i,
                /(люблю|обожаю) (тебя|гус[ья])/i,
                /ты лучший/i,
                /(прекрасн|великолепн|замечательн)/i,
                /(восхитительн|потрясающ)/i
            ],
            positive: [
                /(молодец|красав|хорош)/i,
                /(круто|класс|здорово|отлично|супер)/i,
                /(рад|счастлив|доволен)/i,
                /(помог|поддерж|выруч)/i,
                /(спасиб|благодар)/i
            ],
            slightlyPositive: [
                /(привет|здравствуй|добр)/i,
                /(пожалуйста|будьте добры|прошу|извини)/i,
                /(согласен|понимаю|поддержива)/i,
                /(хорош|норм|ладно)/i,
                /(да|конечно|точно)/i
            ],
            slightlyNegative: [
                /^[А-ЯA-Z\s]+$/,  // Капс
                /(дурак|тупой)/i,
                /(не нравится|неприятно)/i,
                /(глуп|бестолков)/i,
                /(фу|бе|мда)/i
            ],
            negative: [
                /(пош[её]л ты|иди на|вали отсюда)/i,
                /(ненавижу|бесит|достал)/i,
                /(мудак|козел|придурок)/i,
                /(заткнись|молчи|закройся)/i,
                /(отстой|дерьмо|говно)/i
            ],
            veryNegative: [
                /(бля|хуй|пизд|еб[ао]|сук[аи]|хер)/i,
                /(нахуй|похуй|заебал)/i,
                /(пидор|гандон|мразь)/i
            ]
        };

        // Проверка на повторяющиеся сообщения
        const recentMessages = await this.getRecentMessages(message.chat.id, 5);
        if (recentMessages.some(msg => msg.text === message.text)) {
            return -0.3 * karmaMultiplier; // Штраф за повторы с учетом множителя
        }

        // Определяем изменение кармы на основе паттернов
        if (hasPatterns(karmaPatterns.veryPositive)) {
            karmaChange = 0.5 + Math.random() * 0.2; // +0.5 до +0.7
        } else if (hasPatterns(karmaPatterns.positive)) {
            karmaChange = 0.3 + Math.random() * 0.1; // +0.3 до +0.4
        } else if (hasPatterns(karmaPatterns.slightlyPositive)) {
            karmaChange = 0.1 + Math.random() * 0.1; // +0.1 до +0.2
        } else if (hasPatterns(karmaPatterns.veryNegative)) {
            karmaChange = -(0.7 + Math.random() * 0.3); // -0.7 до -1.0
        } else if (hasPatterns(karmaPatterns.negative)) {
            karmaChange = -(0.4 + Math.random() * 0.2); // -0.4 до -0.6
        } else if (hasPatterns(karmaPatterns.slightlyNegative)) {
            karmaChange = -(0.1 + Math.random() * 0.2); // -0.1 до -0.3
        }

        // Применяем множитель кармы
        karmaChange *= karmaMultiplier;

        // Дополнительные проверки только если нет явных паттернов
        if (karmaChange === 0) {
            if (text.length > 200) {
                karmaChange = 0.1 * karmaMultiplier; // Бонус с учетом множителя
            }
        }

        console.log('Karma change analysis:', {
            text,
            karmaChange,
            isDirectedToGoose,
            karmaMultiplier,
            patterns: {
                veryPositive: hasPatterns(karmaPatterns.veryPositive),
                positive: hasPatterns(karmaPatterns.positive),
                slightlyPositive: hasPatterns(karmaPatterns.slightlyPositive),
                slightlyNegative: hasPatterns(karmaPatterns.slightlyNegative),
                negative: hasPatterns(karmaPatterns.negative),
                veryNegative: hasPatterns(karmaPatterns.veryNegative)
            }
        });

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
        try {
            const karmaChange = await this.analyzeMessageForKarma(message);
            if (karmaChange !== 0) {
                const { data: currentKarma } = await this.supabase
                    .from('chat_karma')
                    .select('karma_value')
                    .eq('chat_id', message.chat.id)
                    .single();

                const oldKarma = currentKarma?.karma_value || 0;
                // Округляем до одного знака после запятой
                const newKarma = Math.round(Math.max(-1000, Math.min(1000, oldKarma + karmaChange)) * 10) / 10;

                const { error } = await this.supabase
                    .from('chat_karma')
                    .upsert({
                        chat_id: message.chat.id,
                        karma_value: newKarma,
                        last_update: new Date().toISOString()
                    });

                if (error) throw error;

                return {
                    oldKarma: parseFloat(oldKarma),
                    newKarma: parseFloat(newKarma)
                };
            }
            return null;
        } catch (error) {
            console.error('Error updating karma:', error);
            return null;
        }
    }
}

module.exports = { MessageHandler }; 