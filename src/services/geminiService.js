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

            // Сначала анализируем контекст и тему
            const analysisPrompt = `Проанализируй диалог и выдели:

                                   ПОСЛЕДНИЕ СООБЩЕНИЯ:
                                   ${recentMessages.join('\n')}
                                   
                                   ПОСЛЕДНЕЕ СООБЩЕНИЕ:
                                   "${lastMessage}"

                                   НУЖНО ОПРЕДЕЛИТЬ:
                                   1. Основная тема разговора (1-2 слова):
                                   2. Ключевые слова из последних сообщений (3-5 слов):
                                   3. Эмоциональный тон беседы (позитивный/нейтральный/негативный):
                                   4. Тип последнего сообщения (вопрос/утверждение/приветствие/другое):
                                   
                                   Отвечай СТРОГО по формату:
                                   ТЕМА: [тема]
                                   КЛЮЧЕВЫЕ_СЛОВА: [слово1, слово2, слово3]
                                   ТОН: [тон]
                                   ТИП: [тип]`;

            const analysisResult = await this.model.generateContent({
                contents: [{ parts: [{ text: analysisPrompt }] }]
            });

            const analysis = analysisResult.response.text().trim();

            // Теперь генерируем ответ с учетом анализа
            const responsePrompt = `Ты - полуумный гусь, который ведет осмысленный диалог.

                                  АНАЛИЗ ТЕКУЩЕГО РАЗГОВОРА:
                                  ${analysis}

                                  ПОСЛЕДНИЕ СООБЩЕНИЯ:
                                  ${recentMessages.join('\n')}
                                  
                                  НУЖНО ОТВЕТИТЬ НА:
                                  "${lastMessage}"

                                  ДОСТУПНЫЕ ФРАЗЫ (используй 2-3):
                                  ${phrases.map((p, i) => `${i + 1}) "${p}"`).join('\n')}
                                  
                                  ${useSwears && swearWords.length > 0 ? 
                                    `Доступные маты (используй один если подходит): ${swearWords.join(', ')}` : 
                                    'НЕ используй маты'}

                                  ПРАВИЛА ГЕНЕРАЦИИ ОТВЕТА:
                                  1. Используй выявленную тему и ключевые слова
                                  2. Сохраняй выявленный эмоциональный тон
                                  3. Учитывай тип сообщения при ответе
                                  4. Выбирай фразы, близкие по смыслу к теме
                                  5. Ответ должен быть НЕ ДЛИННЕЕ 15 слов
                                  
                                  ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
                                  - Ответ должен содержать минимум одно ключевое слово
                                  - Строго следуй выявленной теме
                                  - Поддерживай заданный эмоциональный тон
                                  - Используй подходящие фразы из списка
                                  
                                  ЗАПРЕЩЕНО:
                                  - Игнорировать результаты анализа
                                  - Отклоняться от темы
                                  - Менять эмоциональный тон
                                  - Игнорировать тип сообщения

                                  Отвечай ТОЛЬКО готовым предложением, без пояснений.`;

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