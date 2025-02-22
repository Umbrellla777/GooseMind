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

            // Проверяем, не повторяет ли бот последнее сообщение
            if (lastMessage && recentMessages.some(msg => 
                msg.toLowerCase().includes(lastMessage.toLowerCase())
            )) {
                return "Не буду повторять за тобой, я же не попугай!";
            }

            // Анализируем тему разговора
            const analysisPrompt = `Проанализируй последние сообщения чата и определи:
                                  ${recentMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}
                                  
                                  Последнее сообщение: "${lastMessage}"
                                  
                                  1. О чем идет разговор? (1 предложение)
                                  2. Какое настроение беседы? (позитивное/негативное/нейтральное)
                                  3. Это вопрос или утверждение?
                                  4. Есть ли в последнем сообщении обвинение в повторении?
                                  
                                  Отвечай строго в формате:
                                  ТЕМА: [тема разговора]
                                  НАСТРОЕНИЕ: [настроение]
                                  ТИП: [вопрос/утверждение]
                                  ОБВИНЕНИЕ_В_ПОВТОРЕНИИ: [да/нет]`;

            const analysisResult = await this.model.generateContent({
                contents: [{ parts: [{ text: analysisPrompt }] }]
            });

            const analysis = analysisResult.response.text().trim();

            // Если есть обвинение в повторении, даем специальный ответ
            if (analysis.includes('ОБВИНЕНИЕ_В_ПОВТОРЕНИИ: да')) {
                const responses = [
                    "Я не повторяю, я поддерживаю беседу!",
                    "Не путай умение слушать с попугайничеством.",
                    "Я не попугай, я полуумный гусь!",
                    "Я не повторяю, я творчески перерабатываю информацию!",
                    "А ты точно уверен, что это я повторяю?"
                ];
                return responses[Math.floor(Math.random() * responses.length)];
            }

            // Разбиваем фразы на отдельные
            const phrases = basePhrase.split(/[.!?]+/)
                .map(p => p.trim())
                .filter(p => p.length > 0 && !lastMessage.toLowerCase().includes(p.toLowerCase())); // Исключаем фразы из последнего сообщения

            // Генерируем ответ с учетом анализа
            const responsePrompt = `Ты - полуумный гусь. Тебе нужно ответить на сообщение, используя предоставленные фразы.

                                  АНАЛИЗ РАЗГОВОРА:
                                  ${analysis}

                                  ПОСЛЕДНЕЕ СООБЩЕНИЕ:
                                  "${lastMessage}"

                                  ДОСТУПНЫЕ ФРАЗЫ (используй 2-3 штуки):
                                  ${phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

                                  ${useSwears ? `ДОСТУПНЫЕ МАТЫ (используй один): ${swearWords.join(', ')}` : 'НЕ ИСПОЛЬЗУЙ МАТЫ'}

                                  ПРАВИЛА:
                                  1. НИКОГДА не повторяй слова из последнего сообщения
                                  2. Ответ должен быть оригинальным
                                  3. Используй подходящие фразы из списка
                                  4. Сохраняй настроение беседы
                                  5. Если это вопрос - дай конкретный ответ
                                  6. Максимум 15 слов
                                  7. Добавь немного юмора, но оставайся в контексте

                                  ЗАПРЕЩЕНО:
                                  - Копировать фразы собеседника
                                  - Игнорировать тему разговора
                                  - Менять тему
                                  - Использовать фразы без связи с контекстом

                                  Отвечай одним оригинальным предложением.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }]
            });

            let response = result.response.text().trim();
            
            // Обрезаем до 15 слов
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