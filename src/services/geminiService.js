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

            const phrases = basePhrase.split(/[.!?]+/).filter(p => {
                const cleaned = p.trim().toLowerCase();
                return cleaned.length > 0 && !lastMessage.toLowerCase().includes(cleaned);
            });
            
            // Разбиваем контекст на последние сообщения
            const recentMessages = context.split('\n')
                .filter(msg => msg.trim().length > 0)
                .slice(-10)  // Берем последние 10 сообщений
                .map(msg => msg.trim());

            const selectedCount = Math.floor(Math.random() * 3) + 1;
            const selectedPhrases = [];
            
            while (selectedPhrases.length < selectedCount && phrases.length > 0) {
                const index = Math.floor(Math.random() * phrases.length);
                selectedPhrases.push(phrases[index].trim());
                phrases.splice(index, 1);
            }

            const prompt = `Контекст: Ты - полуумный гусь, который отвечает на сообщения в чате.
                           Твоя задача - составить ОДНО короткое логичное предложение, используя предоставленные фразы.
                           
                           История последних сообщений:
                           ${recentMessages.map((msg, i) => `${recentMessages.length - i}) ${msg}`).join('\n')}
                           
                           Последнее сообщение собеседника:
                           "${lastMessage}"
                           
                           Фразы для использования:
                           ${selectedPhrases.map((p, i) => `${i + 1}) "${p}"`).join('\n')}
                           
                           ${useSwears && swearWords.length > 0 ? 
                             `Доступные маты (ОБЯЗАТЕЛЬНО использовать один): ${swearWords.join(', ')}` : 
                             'НЕ используй маты'}
                           
                           Инструкции:
                           1. Внимательно изучи историю сообщений, чтобы понять контекст разговора
                           2. Определи основную тему обсуждения из последних сообщений
                           3. Найди связь между темой разговора и предоставленными фразами
                           4. Используй ВСЕ предоставленные фразы, объединяя их в ОДНО КОРОТКОЕ предложение
                           5. Твой ответ должен продолжать текущую тему разговора
                           6. Если это вопрос - дай краткий ответ по теме, используя фразы
                           7. Если это утверждение - кратко продолжи мысль в контексте беседы
                           8. Если это приветствие - поздоровайся в ответ
                           9. ${useSwears && swearWords.length > 0 ? 
                              'ОБЯЗАТЕЛЬНО используй один из предоставленных матов' : 
                              'НЕ используй маты'}
                           10. Сохраняй разговорный стиль и юмор
                           11. Ответ должен быть НЕ ДЛИННЕЕ 15 слов
                           12. Если не можешь составить осмысленный ответ в контексте - верни "Гусь молчит..."
                           
                           Важно:
                           - Ответ должен быть логически связан с ТЕКУЩЕЙ темой разговора
                           - Используй контекст из истории сообщений для построения ответа
                           - Все фразы должны быть естественно вплетены в ответ
                           - Избегай бессмысленных или нелогичных комбинаций фраз
                           - Лучше КОРОТКИЙ логичный ответ, чем длинный но бессвязный
                           - Следуй теме разговора, не меняй её резко
                           
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