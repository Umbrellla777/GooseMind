const { ForefrontAI } = require('forefront-ai');

class GPTJService {
    constructor() {
        this.ai = new ForefrontAI({
            model: 'gpt-j-6b',
            temperature: 0.8
        });
    }

    async generateResponse(message, karma, character) {
        // Аналогичный промпт
    }
} 