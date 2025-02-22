const CharacterAI = require('node_characterai');
const config = require('../config');

class CharacterAIService {
    constructor() {
        this.characterAI = new CharacterAI();
        this.chat = null;
        this.initialize();
        
        // Проверяем токен каждый день
        setInterval(() => this.checkToken(), 24 * 60 * 60 * 1000);
    }

    async initialize() {
        try {
            await this.characterAI.authenticateWithToken(config.CHARACTER_AI.TOKEN);
            
            // Создаем чат
            this.chat = await this.characterAI.createOrContinueChat(
                config.CHARACTER_AI.CHARACTER_ID
            );

            console.log('CharacterAI initialized successfully');
            await this.checkToken(); // Проверяем токен при запуске
        } catch (error) {
            if (error.message.includes('token expired')) {
                console.error('Token expired, switching to guest mode');
                await this.initializeAsGuest();
            } else {
                console.error('CharacterAI init error:', error);
                await this.initializeAsGuest();
            }
        }
    }

    async checkToken() {
        try {
            const token = config.CHARACTER_AI.TOKEN;
            if (!token) return;

            // Декодируем JWT токен
            const [header, payload, signature] = token.split('.');
            const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

            // Получаем время истечения токена
            const expirationDate = new Date(decodedPayload.exp * 1000);
            const now = new Date();
            const daysUntilExpiration = Math.floor((expirationDate - now) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiration <= 3) {
                console.warn(`⚠️ ВНИМАНИЕ: Токен Character AI истекает через ${daysUntilExpiration} дней!`);
                // Можно добавить отправку уведомления в телеграм
                if (this.bot) {
                    await this.bot.telegram.sendMessage(
                        config.ADMIN_CHAT_ID,
                        `⚠️ Токен Character AI истекает через ${daysUntilExpiration} дней!\nНеобходимо обновить токен.`
                    );
                }
            }
        } catch (error) {
            console.error('Error checking token:', error);
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