const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');

class GeminiService {
    constructor() {
        this.model = new GoogleGenerativeAI(config.GEMINI.API_KEY)
            .getGenerativeModel({ model: 'gemini-pro' });
    }

    async analyzeMessage(text) {
        try {
            const prompt = `Проанализируй текст и определи:
                          1. Основную тему (например: юмор, работа, игры, еда)
                          2. Эмоциональный тон (например: веселый, грустный, серьезный)
                          3. Тип сообщения (вопрос/утверждение/восклицание)
                          4. Если это вопрос - какой ответ ожидается
                          5. 3-4 тематических слова для ответа
                          6. Если есть маты - включи их
                          7. Подходящие эмодзи
                          Ответ дай ТОЛЬКО словами через запятую.
                          
                          Текст: "${text}"`;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            });

            let keywords = result.response.text()
                .trim()
                .replace(/^["']|["']$/g, '')
                .split(',')
                .map(word => word.trim())
                .filter(word => word.length > 0);

            return keywords;
        } catch (error) {
            console.error('Gemini analysis error:', error);
            return [];
        }
    }

    async improveText(text, characterType = 'normal') {
        try {
            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const useSwears = Math.random() * 100 < characterSettings.swearProbability;

            const prompt = `Контекст: Ты - полуумный гусь, который отвечает на сообщения в чате.
                           
                           ТВОЙ ХАРАКТЕР:
                           ${characterSettings.traits.map(trait => `- ${trait}`).join('\n')}
                           - Ценишь краткость и меткость фраз

                           Твоя задача - составить одно предложение, используя ВСЕ эти слова: ${text}
                           
                           Правила составления предложения:
                           1. НУЖНО использовать ВСЕ слова (можно менять их форму)
                           2. Можно менять порядок слов и добавлять знаки препинания
                           3. НЕЛЬЗЯ добавлять или убирать слова
                           4. Отвечай в соответствии со своим характером
                           5. Если это ответ на вопрос - предложение должно быть ответом
                           6. Сохраняй разговорный стиль
                           7. Используй сленг уместный для своего характера
                           8. Добавляй эмоции через знаки (!!, ?!)
                           9. Старайся сделать ответ коротким и метким
                           
                           ${useSwears ? 'Можно использовать умеренный мат' : 'Без мата'}
                           
                           Отвечай ТОЛЬКО готовым предложением, без пояснений.`;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            });

            let response = result.response.text()
                .trim()
                .replace(/^["']|["']$/g, '');

            return response;
        } catch (error) {
            console.error('Gemini API error:', error);
            return text;
        }
    }

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            // Максимально нейтральный промпт
            const prompt = `Давай поиграем в текстовую игру!
            
            Ты - гусь, который общается в чате.
            
            Твои особенности:
            - Настроение: ${karma > 0 ? 'хорошее' : 'не очень'}
            - Стиль: ${characterSettings.name}
            - Черты: ${characterSettings.traits.join(', ')}
            
            Что произошло: ${context}
            
            Тебе написали: "${lastMessage}"
            
            Как бы ты ответил? Напиши 1-2 предложения и добавь подходящий эмодзи.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.8,
                    maxOutputTokens: 100,
                }
            });

            let response = result.response.text().trim();

            // Пост-обработка для усиления характера
            if (karma <= -500) {
                response = this.enhanceNegativeResponse(response, karma);
            }

            return response;
        } catch (error) {
            console.error('Gemini error:', error);
            return "Гусь молчит...";
        }
    }

    enhanceNegativeResponse(text, karma) {
        let enhanced = text.toUpperCase();
        
        const replacements = {
            'не нравится': 'раздражает',
            'плохо': 'ужасно',
            'уходи': 'прочь',
            'замолчи': 'тихо',
            'глупый': 'неумный',
            'дурак': 'балбес',
            'злой': 'сердитый',
            'раздражает': 'бесит'
        };

        for (const [soft, hard] of Object.entries(replacements)) {
            enhanced = enhanced.replace(new RegExp(soft, 'gi'), hard);
        }

        const emojis = ['😤', '😠', '💢', '😾', '🙄', '👎', '⚡️'];
        if (!enhanced.includes('😤') && !enhanced.includes('😠')) {
            enhanced = `${emojis[Math.floor(Math.random() * emojis.length)]} ${enhanced}`;
        }

        return enhanced;
    }

    // Добавим метод для извлечения матов из текста
    extractSwearWords(text) {
        // Список матных корней
        const swearRoots = ['хуй', 'пизд', 'ебл', 'бля', 'сук', 'хер', 'пох', 'бл', 'пидр'];
        
        // Разбиваем текст на слова и ищем маты
        const words = text.toLowerCase().split(/\s+/);
        const swears = new Set();
        
        words.forEach(word => {
            if (swearRoots.some(root => word.includes(root))) {
                swears.add(word);
            }
        });
        
        return Array.from(swears);
    }
}

module.exports = { GeminiService }; 