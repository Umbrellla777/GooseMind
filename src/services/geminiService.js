const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI.API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    async analyzeMessage(text) {
        try {
            const prompt = `Проанализируй сообщение и выдели 3-4 ключевых слова или темы. 
                           Отвечай только списком слов через запятую.
                           Пример ответа: "котики, программирование, веселье"
                           Сообщение: "${text}"`;

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
            const prompt = `Исправь грамматику: "${text}"`;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            });

            let response = result.response.text()
                .trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^Вот исправленный вариант.*?:/i, '')
                .replace(/^Исправленное предложение.*?:/i, '')
                .trim();
            
            return response;
        } catch (error) {
            console.error('Gemini API error:', error);
            return text;
        }
    }
}

module.exports = { GeminiService }; 