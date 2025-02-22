const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI.API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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
            const useSwears = Math.random() * 100 < characterSettings.swearProbability;
            
            // Берем последние сообщения для контекста
            const recentMessages = context.split('\n')
                .filter(msg => msg.trim().length > 0)
                .slice(-50)
                .map(msg => msg.trim());

            // Анализируем последнее сообщение
            const analysisPrompt = `Проанализируй сообщение пользователя и определи:
                Сообщение: "${lastMessage}"

                1. Тип сообщения: [вопрос/утверждение/шутка/оскорбление]
                2. Эмоциональный тон: [позитивный/негативный/нейтральный/саркастичный]
                3. Тема: [о чем говорит пользователь]
                4. Ожидаемый ответ: [что пользователь хочет услышать]
                
                Отвечай строго в формате:
                ТИП: [тип]
                ТОН: [тон]
                ТЕМА: [тема]
                ОЖИДАНИЕ: [ожидание]`;

            const analysis = await this.model.generateContent({
                contents: [{ parts: [{ text: analysisPrompt }] }]
            });

            // Генерируем ответ с учетом характера
            const responsePrompt = `Ты - полуумный гусь в Telegram-чате с определенным характером. 
                Тебе нужно ответить на сообщение в соответствии со своим характером.

                ТВОЙ ТЕКУЩИЙ ХАРАКТЕР (${characterSettings.name}):
                ${characterSettings.traits.map(trait => `- ${trait}`).join('\n')}

                ВАЖНО: Ты ДОЛЖЕН отвечать строго в соответствии с этими чертами характера!
                
                КОНТЕКСТ БЕСЕДЫ:
                ${recentMessages.map(msg => `- ${msg}`).join('\n')}
                
                ПОСЛЕДНЕЕ СООБЩЕНИЕ: "${lastMessage}"
                
                АНАЛИЗ СООБЩЕНИЯ:
                ${analysis.response.text()}
                
                ПРАВИЛА ОТВЕТА:
                1. Отвечай СТРОГО в соответствии со своим характером
                2. Используй соответствующий характеру стиль речи
                3. Если характер агрессивный - используй больше мата и грубости
                4. Если характер добрый - будь максимально вежливым и милым
                5. Сохраняй уровень агрессии/доброты соответствующий характеру
                6. Используй капс если характер этого требует
                7. Добавляй эмодзи соответствующие характеру
                8. Старайся уложиться в 1-2 предложения
                9. Отвечай как живой собеседник
                
                ${useSwears ? 'ИСПОЛЬЗУЙ МАТ И ГРУБЫЕ ВЫРАЖЕНИЯ' : 'БЕЗ МАТА И ГРУБОСТИ'}
                
                Ответь одним сообщением строго в характере ${characterSettings.name} гуся.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }]
            });

            let response = result.response.text().trim();
            
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