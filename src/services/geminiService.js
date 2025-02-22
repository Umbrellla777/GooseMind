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

            // Разбиваем контекст на сообщения
            const recentMessages = context.split('\n')
                .filter(msg => msg.trim().length > 0)
                .slice(-20)
                .map(msg => msg.trim())
                .reverse();

            // Анализируем тему разговора
            const analysisPrompt = `Проанализируй последние сообщения чата и определи:
                                  ${recentMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}
                                  
                                  Последнее сообщение: "${lastMessage}"
                                  
                                  1. О чем идет разговор? (1 предложение)
                                  2. Какое настроение беседы? (позитивное/негативное/нейтральное)
                                  3. Это вопрос или утверждение?
                                  4. Есть ли обвинение в повторении слов?
                                  
                                  Отвечай строго в формате:
                                  ТЕМА: [тема разговора]
                                  НАСТРОЕНИЕ: [настроение]
                                  ТИП: [вопрос/утверждение]
                                  ОБВИНЕНИЕ: [да/нет]`;

            const analysisResult = await this.model.generateContent({
                contents: [{ parts: [{ text: analysisPrompt }] }]
            });

            const analysis = analysisResult.response.text().trim();

            // Разбиваем фразы на отдельные
            const phrases = basePhrase.split(/[.!?]+/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

            // Генерируем ответ с учетом анализа
            const responsePrompt = `Ты - полуумный гусь. Тебе нужно ответить на сообщение.

                                  АНАЛИЗ РАЗГОВОРА:
                                  ${analysis}

                                  ПОСЛЕДНЕЕ СООБЩЕНИЕ:
                                  "${lastMessage}"

                                  ДОСТУПНЫЕ ФРАЗЫ (используй 1-2 штуки, если подходят):
                                  ${phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

                                  ${useSwears ? `ДОСТУПНЫЕ МАТЫ (используй один): ${swearWords.join(', ')}` : 'НЕ ИСПОЛЬЗУЙ МАТЫ'}

                                  ПРАВИЛА:
                                  1. Отвечай по смыслу на заданный вопрос или утверждение
                                  2. Используй подходящие фразы из списка, если они есть
                                  3. Сохраняй настроение беседы
                                  4. Максимум 15 слов
                                  5. Добавь немного юмора
                                  
                                  ВАЖНО:
                                  - Отвечай осмысленно и по контексту
                                  - Не повторяй слова собеседника без необходимости
                                  - Если это вопрос - дай конкретный ответ
                                  - Если обвиняют в повторении - защищайся с юмором

                                  Отвечай одним предложением.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }]
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