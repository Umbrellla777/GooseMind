const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI.API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    async improveText(text) {
        try {
            const prompt = `Исправь только грамматические формы слов в следующем предложении для их логической связи. 
                          Не добавляй новых слов, не меняй порядок слов и не удаляй слова: "${text}"
                          Пример:
                          Вход: "кот гулять улица дом"
                          Выход: "кот гуляет по улице у дома"
                          Вход: "я любить программирование компьютер"
                          Выход: "я люблю программирование на компьютере"`;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            });

            return result.response.text().trim().replace(/^["']|["']$/g, '');
        } catch (error) {
            console.error('Gemini API error:', error);
            return text; // Возвращаем оригинальный текст в случае ошибки
        }
    }
}

module.exports = { GeminiService }; 