const CharacterAI = require('node_characterai');
const config = require('../config');

class CharacterAIService {
    constructor() {
        this.characterAI = new CharacterAI();
        this.chat = null;
        
        // Устанавливаем максимальное количество слушателей
        process.setMaxListeners(5);
        
        this.initialize();
    }

    async initialize() {
        try {
            // Настраиваем Puppeteer
            this.characterAI.requester.puppeteerPath = '/usr/bin/chromium';
            this.characterAI.requester.puppeteerLaunchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run'
            ];

            // Пробуем гостевой режим сразу
            await this.initializeAsGuest();

        } catch (error) {
            console.error('CharacterAI init error:', error);
        }
    }

    async initializeAsGuest() {
        try {
            await this.characterAI.authenticateAsGuest();
            this.chat = await this.characterAI.createOrContinueChat(
                config.CHARACTER_AI.CHARACTER_ID
            );
            console.log('CharacterAI initialized as guest');
        } catch (error) {
            console.error('Guest auth failed:', error);
            // Пробуем переинициализировать через 5 секунд
            setTimeout(() => this.initializeAsGuest(), 5000);
        }
    }

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            if (!this.chat) {
                await this.initialize();
            }

            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            const prompt = `[Характер: ${characterSettings.name}
            Карма: ${karma}
            Особенности: ${characterSettings.traits.join(', ')}]
            
            ${lastMessage}`;

            const response = await this.chat.sendAndAwaitResponse(prompt, true);
            
            if (karma <= -500) {
                return this.enhanceNegativeResponse(response.text, karma);
            }

            return response.text;

        } catch (error) {
            console.error('CharacterAI error:', error);
            
            // Если ошибка связана с чатом - пробуем переинициализировать
            if (error.message.includes('chat') || error.message.includes('token')) {
                await this.initialize();
            }
            
            return "Гусь молчит...";
        }
    }

    async improveText(text, characterType = 'normal') {
        try {
            if (!this.chat) {
                await this.initialize();
            }

            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            const prompt = `Улучши этот текст, сохраняя смысл: ${text}`;
            const response = await this.chat.sendAndAwaitResponse(prompt, true);

            if (karma <= -500) {
                return this.enhanceNegativeResponse(response.text, karma);
            }

            return response.text;
        } catch (error) {
            console.error('CharacterAI improve error:', error);
            return text;
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