const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
const { PROMPTS } = require('../config/prompts');
const { KarmaService } = require('./karmaService');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash-thinking-exp-01-21",
        });
        this.karmaService = new KarmaService();

        // Конфигурация для разных уровней кармы
        this.configs = {
            '-1000': {
                temperature: 1.0,
                topP: 1.0,
                topK: 1,
                maxOutputTokens: 256,
            },
            '0': {
                temperature: 0.7,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 256,
            },
            '1000': {
                temperature: 0.9,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 256,
            }
        };
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

    async improveText(text) {
        try {
            const prompt = `Контекст: Ты - полуумный гусь, который отвечает на сообщения в чате.
                           Твоя задача - составить одно предложение, используя ВСЕ эти слова: ${text}
                           
                           Правила составления предложения:
                           1. НУЖНО использовать ВСЕ слова (можно менять их форму)
                           2. Можно менять порядок слов и добавлять знаки препинания
                           3. НЕЛЬЗЯ добавлять или убирать слова
                           4. Если есть маты - обязательно их использовать
                           5. Если это ответ на вопрос - предложение должно быть ответом
                           6. Сохраняй разговорный стиль, можно использовать сленг
                           7. Добавляй эмоции через знаки (!!, ?!)
                           
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

    getPrompt(karma, lastMessage) {
        // Определяем базовый уровень кармы
        let level = '0';
        if (karma <= -1000) level = '-1000';
        else if (karma >= 1000) level = '1000';

        const prompt = PROMPTS[level];
        return `Ты - ${prompt.role}!
            Твоя карма: ${karma}
            Твой характер: ${prompt.character}

            ${prompt.rules}

            ПОСЛЕДНЕЕ СООБЩЕНИЕ: "${lastMessage}"

            ${prompt.instruction}`;
    }

    async generateContinuation(basePhrase, context, lastMessage, karma) {
        try {
            // Определяем конфигурацию на основе кармы
            let configLevel = '0';
            if (karma <= -1000) configLevel = '-1000';
            else if (karma >= 1000) configLevel = '1000';

            const chatSession = this.model.startChat({
                generationConfig: this.configs[configLevel],
                history: [
                    {
                        role: "user",
                        parts: [{ text: this.getPrompt(karma, lastMessage) }]
                    }
                ]
            });

            const result = await chatSession.sendMessage(lastMessage);
            return result.response.text();

        } catch (error) {
            console.error('Gemini continuation error:', error);
            return "Гусь молчит...";
        }
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