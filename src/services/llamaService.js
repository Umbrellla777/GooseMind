const LlamaAI = require('llamaai');
const config = require('../config');

class LlamaService {
    constructor() {
        this.llama = new LlamaAI(config.LLAMA.API_KEY);
    }

    getCharacterPrompt(karma, characterSettings) {
        const prompts = {
            divine: `Ты - божественный гусь (карма ${karma}).
                - Используй только возвышенные выражения
                - Добавляй эмодзи: 😇✨🙏💖👼
                - Благословляй и дари любовь
                - Говори как высшее существо`,

            angelic: `Ты - ангельский гусь (карма ${karma}).
                - Излучай чистоту и свет
                - Добавляй эмодзи: 👼💖✨🙏😇
                - Говори с любовью и заботой
                - Будь благородным и милосердным`,

            saint: `Ты - святой гусь (карма ${karma}).
                - Излучай святость и мудрость
                - Добавляй эмодзи: 🙏✨💫👼💖
                - Говори праведно и мудро
                - Прощай и благословляй`,

            // ... (добавляем для каждого характера)

            demonic: `Ты - демонический гусь (карма ${karma}).
                - ИСПОЛЬЗУЙ ТОЛЬКО КАПС
                - Добавляй эмодзи: 👿💀☠️🔪💢
                - МАКСИМАЛЬНАЯ АГРЕССИЯ И МАТ
                - ЖЕЛАЙ ВСЕМ СМЕРТИ И СТРАДАНИЙ`
        };

        return prompts[characterType] || `Ты - гусь с кармой ${karma}.\n${characterSettings.traits.join('\n')}`;
    }

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');

            // Формируем контекст из последних сообщений
            const recentMessages = context.split('\n')
                .filter(msg => msg.trim().length > 0)
                .slice(-5)
                .map(msg => ({role: "user", content: msg}));

            // Основной промпт
            const systemPrompt = {
                role: "system",
                content: `${this.getCharacterPrompt(karma, characterSettings)}

                    СТРОГИЕ ПРАВИЛА:
                    1. Ты ОБЯЗАН отвечать строго как ${characterSettings.name} гусь
                    2. Твой уровень кармы: ${karma}
                    3. Характер менять ЗАПРЕЩЕНО
                    4. Ответ: 1-2 предложения
                    
                    ТВОИ ЧЕРТЫ:
                    ${characterSettings.traits.join('\n')}
                    
                    СТИЛЬ РЕЧИ:
                    ${this.getSpeechStyle(karma)}
                    
                    УРОВЕНЬ АГРЕССИИ:
                    ${this.getAggressionLevel(karma)}
                    
                    ЭМОЦИОНАЛЬНЫЙ ТОН:
                    ${this.getEmotionalTone(karma)}`
            };

            // Формируем запрос
            const apiRequestJson = {
                messages: [
                    systemPrompt,
                    ...recentMessages,
                    {
                        role: "user",
                        content: lastMessage
                    }
                ],
                stream: false,
                temperature: 0.8,
                max_tokens: 100
            };

            // Выполняем запрос
            const response = await this.llama.run(apiRequestJson);
            
            // Обрабатываем ответ
            let generatedText = response.choices[0].message.content.trim();

            // Пост-обработка для усиления характера
            if (karma <= -500) {
                generatedText = generatedText.toUpperCase();
            }

            return generatedText;

        } catch (error) {
            console.error('Llama error:', error);
            return "Гусь молчит...";
        }
    }

    // Вспомогательные методы для определения стиля
    getSpeechStyle(karma) {
        if (karma >= 500) return 'Возвышенный, божественный стиль';
        if (karma >= 0) return 'Дружелюбный, позитивный стиль';
        if (karma >= -300) return 'Ворчливый, недовольный стиль';
        if (karma >= -600) return 'Агрессивный стиль с матом';
        return 'КАПС, МАТ, УГРОЗЫ';
    }

    getAggressionLevel(karma) {
        if (karma >= 500) return 'Полное отсутствие агрессии';
        if (karma >= 0) return 'Минимальная агрессия';
        if (karma >= -300) return 'Средняя агрессия';
        if (karma >= -600) return 'Высокая агрессия';
        return 'МАКСИМАЛЬНАЯ АГРЕССИЯ';
    }

    getEmotionalTone(karma) {
        if (karma >= 500) return 'Божественная любовь и свет';
        if (karma >= 0) return 'Позитив и дружелюбие';
        if (karma >= -300) return 'Недовольство и раздражение';
        if (karma >= -600) return 'Злость и агрессия';
        return 'ЯРОСТЬ И НЕНАВИСТЬ';
    }
}

module.exports = { LlamaService }; 