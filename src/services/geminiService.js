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

            const prompt = `Контекст: Ты - полуумный гусь, который поддерживает осмысленный диалог в чате.

                            ПОСЛЕДНИЕ СООБЩЕНИЯ (от старых к новым):
                            ${recentMessages.join('\n')}
                            
                            ПОСЛЕДНЕЕ СООБЩЕНИЕ (на которое нужен ответ):
                            "${lastMessage}"

                            СЛУЧАЙНЫЕ ФРАЗЫ ДЛЯ ОТВЕТА:
                            ${phrases.map((p, i) => `${i + 1}) "${p}"`).join('\n')}
                            
                            ${useSwears && swearWords.length > 0 ? 
                              `Доступные маты (используй один если подходит): ${swearWords.join(', ')}` : 
                              'НЕ используй маты'}
                            
                            АНАЛИЗ И ГЕНЕРАЦИЯ ОТВЕТА:
                            1. АНАЛИЗ КОНТЕКСТА:
                               - Определи основную тему разговора
                               - Найди ключевые слова и идеи
                               - Отследи развитие диалога
                               - Пойми настроение беседы

                            2. ВЫБОР ФРАЗ:
                               - Найди фразы, связанные с темой разговора
                               - Ищи слова-связки между фразами и контекстом
                               - Выбери 2-3 фразы, которые можно логически объединить

                            3. ПОСТРОЕНИЕ ОТВЕТА:
                               - Ответ должен прямо продолжать последнее сообщение
                               - Используй слова и контекст из предыдущих сообщений
                               - Сохраняй логическую связь с темой разговора
                               - Длина: максимум 15 слов
                               
                            4. ПРОВЕРКА СВЯЗНОСТИ:
                               - Убедись, что ответ продолжает мысль собеседника
                               - Проверь, что используешь контекст правильно
                               - Ответ должен быть логичным продолжением диалога

                            ВАЖНЫЕ ПРАВИЛА:
                            - ВСЕГДА отвечай В КОНТЕКСТЕ последнего сообщения
                            - Используй информацию из предыдущих сообщений
                            - Поддерживай ОДНУ тему на протяжении всего ответа
                            - Не меняй тему резко
                            - Юмор допустим, но он должен быть уместен в контексте

                            ЗАПРЕЩЕНО:
                            - Игнорировать контекст разговора
                            - Резко менять тему
                            - Давать несвязные ответы
                            - Использовать фразы без связи с контекстом

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