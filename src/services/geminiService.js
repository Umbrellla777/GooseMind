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
                          3. 2-3 ключевых слова, связанных с темой
                          4. Если есть маты - включи их в ключевые слова
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
            const prompt = `Напиши одно предложение, используя ВСЕ эти слова: ${text}
                           Правила:
                           - Можно менять форму слов
                           - Можно менять порядок слов
                           - Можно добавлять знаки препинания
                           - НЕЛЬЗЯ добавлять новые слова
                           - НЕЛЬЗЯ удалять слова
                           - МОЖНО и НУЖНО использовать маты, если они есть в словах
                           Отвечай ТОЛЬКО готовым предложением.`;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
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
}

module.exports = { GeminiService }; 