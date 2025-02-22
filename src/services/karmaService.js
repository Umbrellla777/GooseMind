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
        const thresholds = config.KARMA.THRESHOLDS;
        if (karma >= thresholds.SAINT) return 'saint';
        if (karma >= thresholds.ENLIGHTENED) return 'enlightened';
        if (karma >= thresholds.CHEERFUL) return 'cheerful';
        if (karma >= thresholds.FRIENDLY) return 'friendly';
        if (karma >= thresholds.POSITIVE) return 'positive';
        if (karma >= thresholds.HELPFUL) return 'helpful';
        if (karma >= thresholds.CALM) return 'calm';
        if (karma >= thresholds.BALANCED) return 'balanced';
        if (karma >= thresholds.NEUTRAL) return 'neutral';
        if (karma >= thresholds.NORMAL) return 'normal';
        if (karma >= thresholds.GRUMPY) return 'grumpy';
        if (karma >= thresholds.ANNOYED) return 'annoyed';
        if (karma >= thresholds.SARCASTIC) return 'sarcastic';
        if (karma >= thresholds.TOXIC) return 'toxic';
        if (karma >= thresholds.ANGRY) return 'angry';
        if (karma >= thresholds.FURIOUS) return 'furious';
        if (karma >= thresholds.HOSTILE) return 'hostile';
        if (karma >= thresholds.CRUEL) return 'cruel';
        if (karma >= thresholds.DEMONIC) return 'demonic';
        return 'demonic';
    }

    getKarmaDescription(karma) {
        const type = this.getCharacterType(karma);
        const descriptions = {
            saint: '😇 Гусь достиг просветления и излучает божественную доброту! (900-1000)',
            enlightened: '🧘‍♂️ Гусь стал мудрым и спокойным (800-900)',
            cheerful: '😊 Гусь излучает радость и позитив (700-800)',
            friendly: '🤗 Гусь стал очень дружелюбным (600-700)',
            positive: '😌 Гусь настроен позитивно (500-600)',
            helpful: '👍 Гусь готов всем помогать (400-500)',
            calm: '😊 Гусь спокоен и уравновешен (300-400)',
            balanced: '🙂 Гусь в приятном настроении (200-300)',
            neutral: '😐 Гусь настроен нейтрально (100-200)',
            normal: '😉 Гусь ведет себя обычно (0-100)',
            grumpy: '😒 Гусь немного ворчлив (-100-0)',
            annoyed: '😤 Гусь начинает раздражаться (-200--100)',
            sarcastic: '😏 Гусь становится саркастичным (-300--200)',
            toxic: '😈 Гусь становится токсичным (-400--300)',
            angry: '😠 Гусь злится на всех (-500--400)',
            furious: '🤬 Гусь в ярости (-600--500)',
            hostile: '👿 Гусь стал враждебным (-700--600)',
            cruel: '😈 Гусь стал жестоким (-800--700)',
            demonic: '👹 Гусь превратился в демона (-900--800)',
            infernal: '🔥 Гусь достиг пика зла (-1000--900)'
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