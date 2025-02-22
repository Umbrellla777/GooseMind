const axios = require('axios');
const config = require('../config');

class CharacterAIService {
    constructor() {
        this.baseUrl = 'https://character.ai';
        this.token = config.CHARACTER_AI.TOKEN;
        this.characterId = config.CHARACTER_AI.CHARACTER_ID;
        this.chatId = null;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Authorization': `Token ${this.token}`,
                'Cookie': `web-next-auth=${this.token}`,
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://character.ai/',
                'Origin': 'https://character.ai'
            }
        });

        this.initialize();
    }

    async initialize() {
        try {
            // Получаем информацию о персонаже
            const characterInfo = await this.getCharacterInfo();
            console.log('Character info loaded:', characterInfo.name);

            // Создаем новый чат или получаем существующий
            const chatInfo = await this.createOrGetChat();
            this.chatId = chatInfo.external_id;
            console.log('Chat initialized:', this.chatId);

            // Устанавливаем базовый промпт
            await this.setBasePrompt();
        } catch (error) {
            console.error('CharacterAI init error:', error);
            setTimeout(() => this.initialize(), 5000);
        }
    }

    async getCharacterInfo() {
        try {
            const response = await this.client.get(`/chat/character/info/${this.characterId}/`);
            return response.data;
        } catch (error) {
            console.error('Error fetching character info:', error);
            throw error;
        }
    }

    async createOrGetChat() {
        try {
            // Пробуем получить существующий чат
            const response = await this.client.get(`/chat/history/continue/`, {
                params: { character_external_id: this.characterId }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting/creating chat:', error);
            throw error;
        }
    }

    async setBasePrompt() {
        const basePrompt = `Ты полуумный гусь, который общается в телеграм чате. 
        Ты должен отвечать кратко, с юмором и сарказмом. 
        Твои ответы должны быть не длиннее 2-3 предложений.
        Используй эмодзи для выражения эмоций.
        Твой характер может меняться в зависимости от кармы.`;

        try {
            await this.client.post('/chat/character/update_greeting/', {
                character_external_id: this.characterId,
                greeting: basePrompt
            });
        } catch (error) {
            console.error('Error setting base prompt:', error);
        }
    }

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            if (!this.chatId) {
                await this.initialize();
            }

            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            const prompt = `[Характер: ${characterSettings.name}
            Карма: ${karma}
            Особенности: ${characterSettings.traits.join(', ')}]
            
            ${lastMessage}`;

            const response = await this.client.post('/chat/streaming/send/', {
                history_external_id: this.chatId,
                text: prompt,
                tgt: 'internal_id'
            });
            
            let text = response.data.replies[0].text;

            if (karma <= -500) {
                text = this.enhanceNegativeResponse(text, karma);
            }

            return text;

        } catch (error) {
            console.error('CharacterAI error:', error);
            
            if (error.response?.status === 401) {
                await this.initialize();
            }
            
            return "Гусь молчит...";
        }
    }

    async improveText(text, characterType = 'normal') {
        try {
            if (!this.chatId) {
                await this.initialize();
            }

            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            const prompt = `Улучши этот текст, сохраняя смысл: ${text}`;
            const response = await this.client.post('/chat/streaming/send/', {
                history_external_id: this.chatId,
                text: prompt,
                tgt: 'internal_id'
            });

            let improvedText = response.data.replies[0].text;

            if (karma <= -500) {
                improvedText = this.enhanceNegativeResponse(improvedText, karma);
            }

            return improvedText;
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