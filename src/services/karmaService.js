const config = require('../config');

class KarmaService {
    constructor(supabase) {
        this.supabase = supabase;
        this.karmaCache = new Map(); // chatId -> karma
    }

    async initKarma(chatId) {
        if (!this.karmaCache.has(chatId)) {
            const { data } = await this.supabase
                .from('chat_karma')
                .select('karma')
                .eq('chat_id', chatId)
                .single();

            const karma = data ? data.karma : config.KARMA.DEFAULT;
            this.karmaCache.set(chatId, karma);
            return karma;
        }
        return this.karmaCache.get(chatId);
    }

    async updateKarma(chatId, message, ctx) {
        let karma = await this.initKarma(chatId);
        const oldKarma = karma;
        
        const karmaChange = await this.analyzeMessage(message);
        karma = Math.max(config.KARMA.MIN, Math.min(config.KARMA.MAX, karma + karmaChange));
        
        await this.supabase
            .from('chat_karma')
            .upsert({ chat_id: chatId, karma: karma });
        
        this.karmaCache.set(chatId, karma);

        // Уведомляем только при изменении сотен
        const oldHundreds = Math.floor(oldKarma / 100);
        const newHundreds = Math.floor(karma / 100);
        
        if (oldHundreds !== newHundreds) {
            const change = karma > oldKarma ? 'повысилась' : 'понизилась';
            await ctx.reply(
                `🔄 Карма чата ${change} до ${karma}!\n` +
                this.getKarmaDescription(karma)
            );
        }

        return karma;
    }

    getCharacterType(karma) {
        // Определяем характер точно по диапазонам, от высшего к низшему
        if (karma >= 900) return 'divine';      // Божественный (900 до 1000)
        if (karma >= 800) return 'angelic';     // Ангельский (800 до 900)
        if (karma >= 700) return 'saint';       // Святой (700 до 800)
        if (karma >= 600) return 'blessed';     // Благословенный (600 до 700)
        if (karma >= 500) return 'enlightened'; // Просветленный (500 до 600)
        if (karma >= 400) return 'cheerful';    // Весельчак (400 до 500)
        if (karma >= 300) return 'friendly';    // Дружелюбный (300 до 400)
        if (karma >= 200) return 'peaceful';    // Миролюбивый (200 до 300)
        if (karma >= 100) return 'positive';    // Позитивный (100 до 200)
        if (karma >= 0) return 'normal';        // Обычный (0 до 100)
        if (karma >= -100) return 'grumpy';     // Ворчливый (-100 до 0)
        if (karma >= -200) return 'sarcastic';  // Саркастичный (-200 до -100)
        if (karma >= -300) return 'annoyed';    // Раздраженный (-300 до -200)
        if (karma >= -400) return 'irritated';  // Нервный (-400 до -300)
        if (karma >= -500) return 'angry';      // Злой (-500 до -400)
        if (karma >= -600) return 'aggressive'; // Агрессивный (-600 до -500)
        if (karma >= -700) return 'furious';    // В ярости (-700 до -600)
        if (karma >= -800) return 'hostile';    // Враждебный (-800 до -700)
        if (karma >= -900) return 'cruel';      // Жестокий (-900 до -800)
        if (karma >= -1000) return 'demonic';   // Демонический (-1000 до -900)
        return 'infernal';                      // Инфернальный (< -1000)
    }

    getKarmaDescription(karma) {
        const type = this.getCharacterType(karma);
        const descriptions = {
            divine: '😇 Гусь достиг божественного просветления (900 до 1000)',
            angelic: '👼 Гусь стал ангельски чистым (800 до 900)',
            saint: '🙏 Гусь обрел святость (700 до 800)',
            blessed: '✨ Гусь благословлен (600 до 700)',
            enlightened: '🧘‍♂️ Гусь достиг просветления (500 до 600)',
            cheerful: '�� Гусь излучает радость и веселье (400 до 500)',
            friendly: '🤗 Гусь очень дружелюбен (300 до 400)',
            peaceful: '☮️ Гусь миролюбив и спокоен (200 до 300)',
            positive: '😌 Гусь настроен позитивно (100 до 200)',
            normal: '😉 Гусь в обычном настроении (0 до 100)',
            grumpy: '😒 Гусь ворчит и бурчит (-100 до 0)',
            sarcastic: '�� Гусь стал саркастичным (-200 до -100)',
            annoyed: '😤 Гусь раздражен (-300 до -200)',
            irritated: '�� Гусь на нервах (-400 до -300)',
            angry: '😡 Гусь злится (-500 до -400)',
            aggressive: '🤬 Гусь стал агрессивным (-600 до -500)',
            furious: '💢 Гусь в ярости (-700 до -600)',
            hostile: '👿 Гусь враждебен (-800 до -700)',
            cruel: '�� Гусь стал жестоким (-900 до -800)',
            demonic: '👹 Гусь превратился в демона (-1000 до -900)',
            infernal: '🔥 Гусь достиг пика зла (< -1000)'
        };
        return descriptions[type] || '🤔 Гусь в неопределенном состоянии';
    }

    async analyzeMessage(message) {
        let karmaChange = 0;
        const text = message.text.toLowerCase();
        const weights = config.KARMA.WEIGHTS;

        // Анализ матов и оскорблений
        const swearWords = ['блять', 'сука', 'хуй', 'пизда', 'ебать', 'нахуй'];
        const insultWords = ['тупой', 'дебил', 'мудак', 'идиот', 'придурок', 'даун'];
        const toxicWords = ['заткнись', 'отвали', 'отъебись', 'пошел нахуй', 'иди нахер'];
        
        // Позитивные слова и фразы
        const positiveWords = ['спасибо', 'благодарю', 'помогу', 'рад', 'круто', 'классно', 'здорово'];
        const helpfulWords = ['давай помогу', 'могу помочь', 'подскажу', 'научу', 'объясню'];
        const friendlyWords = ['друг', 'братан', 'приятель', 'дружище', 'товарищ'];

        // Подсчет негативных слов
        let swearCount = swearWords.filter(word => text.includes(word)).length;
        let insultCount = insultWords.filter(word => text.includes(word)).length;
        let toxicCount = toxicWords.filter(word => text.includes(word)).length;

        // Подсчет позитивных слов
        let positiveCount = positiveWords.filter(word => text.includes(word)).length;
        let helpfulCount = helpfulWords.filter(phrase => text.includes(phrase)).length;
        let friendlyCount = friendlyWords.filter(word => text.includes(word)).length;

        // Применяем изменения кармы с небольшими шагами
        karmaChange += swearCount * -3;      // -3 за каждый мат
        karmaChange += insultCount * -5;     // -5 за каждое оскорбление
        karmaChange += toxicCount * -7;      // -7 за каждую токсичную фразу
        karmaChange += positiveCount * 2;    // +2 за каждое позитивное слово
        karmaChange += helpfulCount * 4;     // +4 за каждое предложение помощи
        karmaChange += friendlyCount * 3;    // +3 за каждое дружелюбное обращение

        // Проверяем эмодзи
        const positiveEmoji = ['❤️', '👍', '😊', '🙏', '🤗', '😄', '🥰', '😎', '👏'];
        const negativeEmoji = ['👎', '💩', '🖕', '😡', '🤬', '😤', '��', '🤮'];
        
        if (message.entities) {
            const emojiEntities = message.entities.filter(e => e.type === 'emoji');
            const positiveEmojiCount = emojiEntities.filter(e => positiveEmoji.includes(e.emoji)).length;
            const negativeEmojiCount = emojiEntities.filter(e => negativeEmoji.includes(e.emoji)).length;
            
            karmaChange += positiveEmojiCount * 1;  // +1 за каждый позитивный эмодзи
            karmaChange += negativeEmojiCount * -1; // -1 за каждый негативный эмодзи
        }

        // Проверяем КАПС
        if (message.text === message.text.toUpperCase() && message.text.length > 10) {
            karmaChange -= 2; // -2 за капс
        }

        // Проверяем спам
        if (message.text.length > 200 || /(.)\1{4,}/.test(message.text)) {
            karmaChange -= 3; // -3 за спам
        }

        return karmaChange;
    }

    async setKarma(chatId, karma) {
        // Проверяем границы
        karma = Math.max(config.KARMA.MIN, Math.min(config.KARMA.MAX, karma));
        
        // Сохраняем новую карму
        await this.supabase
            .from('chat_karma')
            .upsert({ chat_id: chatId, karma: karma });
        
        // Обновляем кэш
        this.karmaCache.set(chatId, karma);
        
        return karma;
    }
}

module.exports = { KarmaService }; 