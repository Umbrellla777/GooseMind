const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const { KarmaService } = require('./karmaService');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI.API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        this.karmaService = new KarmaService();
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

    async generateContinuation(basePhrase, context, lastMessage, karma) {
        try {
            const characterType = config.KARMA_LEVELS[Math.floor(karma / 100) * 100];
            const useSwears = karma <= -500;
            
            // Заменяем маты на безобидные слова для Gemini
            const safeLastMessage = this.karmaService.replaceSwearWords(lastMessage);
            const safeContext = this.karmaService.replaceSwearWords(context);

            const responsePrompt = `Ты - полуумный гусь в Telegram-чате. 
                Твой текущий характер: ${characterType.name}
                Особенности: ${characterType.traits.join(', ')}
                Карма: ${karma}

                КОНТЕКСТ БЕСЕДЫ:
                ${safeContext}
                
                ПОСЛЕДНЕЕ СООБЩЕНИЕ: "${safeLastMessage}"`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }]
            });

            let response = result.response.text().trim();
            
            // Возвращаем маты обратно если нужно
            if (useSwears) {
                response = this.karmaService.replaceSwearWords(response, true);
            }

            return response;
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