const config = require('../config');

class KarmaService {
    constructor(supabase) {
        this.supabase = supabase;
    }

    async getKarma(chatId) {
        const { data } = await this.supabase
            .from('chat_karma')
            .select('karma_value')
            .eq('chat_id', chatId)
            .single();
        
        return data?.karma_value || 0;
    }

    async updateKarma(chatId, change) {
        const currentKarma = await this.getKarma(chatId);
        const newKarma = Math.max(-1000, Math.min(1000, currentKarma + change));
        
        const { data } = await this.supabase
            .from('chat_karma')
            .upsert({
                chat_id: chatId,
                karma_value: newKarma,
                last_update: new Date()
            })
            .select()
            .single();

        // Проверяем изменение уровня
        const oldLevel = Math.floor(currentKarma / 100) * 100;
        const newLevel = Math.floor(newKarma / 100) * 100;
        
        return {
            karma: data.karma_value,
            levelChanged: oldLevel !== newLevel,
            newLevel: config.KARMA_LEVELS[newLevel]
        };
    }

    getCharacterType(karma) {
        const level = Math.floor(karma / 100) * 100;
        return config.KARMA_LEVELS[level];
    }

    replaceSwearWords(text, reverse = false) {
        let result = text;
        const replacements = config.WORD_REPLACEMENTS;
        
        for (const [from, to] of Object.entries(replacements)) {
            const regex = new RegExp(reverse ? to : from, 'gi');
            result = result.replace(regex, reverse ? from : to);
        }
        
        return result;
    }
}

module.exports = { KarmaService }; 