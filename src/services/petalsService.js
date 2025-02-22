const { PetalsAPI } = require('petals');

class PetalsService {
    constructor() {
        this.petals = new PetalsAPI({
            model: 'bloom-176b'
        });
    }

    async generateResponse(message, karma, character) {
        // Аналогичный промпт
    }
} 