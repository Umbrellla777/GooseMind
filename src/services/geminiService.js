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

    async generateContinuation(basePhrase, context, lastMessage, swearProbability, swearPhrases = []) {
        try {
            const useSwears = Math.random() * 100 < swearProbability;
            const swearWords = this.extractSwearWords(
                basePhrase + ' ' + context + ' ' + swearPhrases.join(' ')
            );

            // Разбиваем на отдельные фразы
            const phrases = basePhrase.split(/[.!?]+/).filter(p => {
                const cleaned = p.trim().toLowerCase();
                return cleaned.length > 0 && !lastMessage.toLowerCase().includes(cleaned);
            });

            // Разбиваем контекст на сообщения
            const recentMessages = context.split('\n')
                .filter(msg => msg.trim().length > 0)
                .slice(-20)
                .map(msg => msg.trim())
                .reverse()
                .map((msg, i) => `[${i + 1}] ${msg}`);

            const prompt = `Контекст: Ты - полуумный гусь, который отвечает на сообщения в чате.

                            ТЕКУЩИЙ РАЗГОВОР (от старых к новым сообщениям):
                            ${recentMessages.join('\n')}
                            
                            ТЕБЕ НУЖНО ОТВЕТИТЬ НА:
                            "${lastMessage}"

                            ДОСТУПНЫЕ ФРАЗЫ (используй 2-3 штуки):
                            ${phrases.map((p, i) => `${i + 1}) "${p}"`).join('\n')}
                            
                            ${useSwears && swearWords.length > 0 ? 
                              `Доступные маты (используй один если подходит): ${swearWords.join(', ')}` : 
                              'НЕ используй маты'}
                            
                            ПОШАГОВАЯ ИНСТРУКЦИЯ:
                            1. Определи главную тему последних 3-5 сообщений
                            2. Найди ключевые слова в последнем сообщении
                            3. Выбери фразы, где есть похожие слова или тема
                            4. Если нет прямых совпадений - ищи ассоциации
                            5. Составь ОДНО предложение, продолжающее тему разговора
                            
                            ПРАВИЛА СОСТАВЛЕНИЯ ОТВЕТА:
                            - Ответ ОБЯЗАТЕЛЬНО должен быть про то же, о чем говорят
                            - Используй слова из последних сообщений
                            - Если фразы совсем не подходят - придумай, как их связать с темой
                            - Ответ должен быть НЕ ДЛИННЕЕ 15 слов
                            - Можно отвечать с юмором, но оставаясь в контексте беседы
                            
                            ПРИМЕРЫ СВЯЗЫВАНИЯ:
                            - Если говорят про еду, а фразы про погоду - свяжи через настроение
                            - Если говорят про работу, а фразы про отдых - свяжи через желания
                            - Если говорят про игры, а фразы про учебу - свяжи через достижения
                            
                            Отвечай ТОЛЬКО готовым предложением, без пояснений.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: prompt }] }]
            });

            let response = result.response.text().trim();
            
            const words = response.split(/\s+/);
            if (words.length > 15) {
                response = words.slice(0, 15).join(' ') + '...';
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