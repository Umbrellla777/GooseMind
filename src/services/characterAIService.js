const CharacterAI = require('node_characterai');
const config = require('../config');

class CharacterAIService {
    constructor() {
        this.characterAI = new CharacterAI();
        this.chat = null;
        this.settings = config.CHARACTER_AI.SETTINGS;
        this.initialize();
    }

    async initialize() {
        try {
            // Используем токен вместо гостевой аутентификации
            await this.characterAI.authenticateWithToken(config.CHARACTER_AI.TOKEN);
            
            // Создаем чат с настройками
            this.chat = await this.characterAI.createOrContinueChat(
                config.CHARACTER_AI.CHARACTER_ID,
                {
                    model: this.settings.MODEL,
                    language: this.settings.LANGUAGE,
                    nsfw: this.settings.NSFW,
                    temperature: this.settings.RANDOMNESS,
                    maxTokens: this.settings.RESPONSE_LENGTH === 'short' ? 100 : 200
                }
            );
        } catch (error) {
            console.error('CharacterAI init error:', error);
        }
    }

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            if (!this.chat) {
                await this.initialize();
            }

            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            // Формируем промпт с учетом характера
            const prompt = `[Характер: ${characterSettings.name}
            Карма: ${karma}
            Особенности: ${characterSettings.traits.join(', ')}]
            
            ${lastMessage}`;

            const response = await this.chat.sendAndAwaitResponse(prompt, true);
            
            // Пост-обработка для усиления характера
            if (karma <= -500) {
                return this.enhanceNegativeResponse(response.text, karma);
            }

            return response.text;

        } catch (error) {
            console.error('CharacterAI error:', error);
            
            // Пробуем переинициализировать при ошибке
            await this.initialize();
            return "Гусь молчит...";
        }
    }

    enhanceNegativeResponse(text, karma) {
        let enhanced = text.toUpperCase();
        
        const replacements = {
            'не нравится': 'БЕСИТ',
            'плохо': 'ХРЕНОВО',
            'уходи': 'ПОШЕЛ НАХРЕН',
            'замолчи': 'ЗАВАЛИ ЕБАЛО',
            'глупый': 'ТУПОЙ МУДАК',
            'дурак': 'ДОЛБОЁБ',
            'злой': 'БЕШЕНЫЙ',
            'раздражает': 'ЗАЕБАЛО'
        };

        for (const [soft, hard] of Object.entries(replacements)) {
            enhanced = enhanced.replace(new RegExp(soft, 'gi'), hard);
        }

        const angryEmoji = ['😡', '🤬', '💢', '👿', '💀', '☠️', '🔪'];
        if (!enhanced.includes('😡') && !enhanced.includes('🤬')) {
            enhanced = `${angryEmoji[Math.floor(Math.random() * angryEmoji.length)]} ${enhanced}`;
        }

        return enhanced;
    }
}

module.exports = { CharacterAIService }; 