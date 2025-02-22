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

    async improveText(text, characterType = 'normal') {
        try {
            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const useSwears = Math.random() * 100 < characterSettings.swearProbability;

            const prompt = `Контекст: Ты - полуумный гусь, который отвечает на сообщения в чате.
                           
                           ТВОЙ ХАРАКТЕР:
                           ${characterSettings.traits.map(trait => `- ${trait}`).join('\n')}
                           - Ценишь краткость и меткость фраз

                           Твоя задача - составить одно предложение, используя ВСЕ эти слова: ${text}
                           
                           Правила составления предложения:
                           1. НУЖНО использовать ВСЕ слова (можно менять их форму)
                           2. Можно менять порядок слов и добавлять знаки препинания
                           3. НЕЛЬЗЯ добавлять или убирать слова
                           4. Отвечай в соответствии со своим характером
                           5. Если это ответ на вопрос - предложение должно быть ответом
                           6. Сохраняй разговорный стиль
                           7. Используй сленг уместный для своего характера
                           8. Добавляй эмоции через знаки (!!, ?!)
                           9. Старайся сделать ответ коротким и метким
                           
                           ${useSwears ? 'Можно использовать умеренный мат' : 'Без мата'}
                           
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

    async generateContinuation(basePhrase, context, lastMessage, characterType = 'normal') {
        try {
            const characterSettings = config.CHARACTER_SETTINGS[characterType];
            const useSwears = Math.random() * 100 < characterSettings.swearProbability;
            
            // Анализ сообщения
            const analysis = await this.model.generateContent({
                contents: [{ parts: [{ text: `Анализ сообщения: "${lastMessage}"\n1. Тип\n2. Тон\n3. Тема\n4. Намерение` }] }]
            });

            // Основной промпт для генерации ответа
            const responsePrompt = `ИНСТРУКЦИЯ ПО ГЕНЕРАЦИИ ОТВЕТА ПОЛУУМНОГО ГУСЯ:

ТЕКУЩАЯ КАРМА: ${characterSettings.name}
УРОВЕНЬ АГРЕССИИ: ${this.getAggressionLevel(characterType)}
СТИЛЬ РЕЧИ: ${this.getSpeechStyle(characterType)}

СТРОЖАЙШИЕ ПРАВИЛА ГЕНЕРАЦИИ:
1. ОТВЕЧАТЬ ТОЛЬКО В СТИЛЕ ТЕКУЩЕЙ КАРМЫ
2. ЗАПРЕЩЕНО ОТКЛОНЯТЬСЯ ОТ ХАРАКТЕРА
3. ЗАПРЕЩЕНО МЕНЯТЬ УРОВЕНЬ АГРЕССИИ
4. ЗАПРЕЩЕНО ИГНОРИРОВАТЬ КАРМУ

ЧЕРТЫ ХАРАКТЕРА (ОБЯЗАТЕЛЬНЫ К СОБЛЮДЕНИЮ):
${characterSettings.traits.map(trait => `• ${trait}`).join('\n')}

ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ ОТВЕТА:
• Тон: ${this.getEmotionalTone(characterType)}
• Стиль: ${this.getWritingStyle(characterType)}
• Эмодзи: ${this.getEmojiStyle(characterType)}
• Мат: ${useSwears ? 'ОБЯЗАТЕЛЬНО ИСПОЛЬЗОВАТЬ' : 'СТРОГО ЗАПРЕЩЕН'}

ПРИМЕРЫ ОТВЕТОВ ДЛЯ ТЕКУЩЕЙ КАРМЫ:
${this.getExampleResponses(characterType)}

СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ: "${lastMessage}"

АНАЛИЗ: ${analysis.response.text()}

ВАЖНО: 
- ОТВЕТ ДОЛЖЕН БЫТЬ МАКСИМУМ 2 ПРЕДЛОЖЕНИЯ
- СТРОГО СОБЛЮДАТЬ ХАРАКТЕР И КАРМУ
- ${useSwears ? 'ИСПОЛЬЗОВАТЬ МАТ И АГРЕССИЮ' : 'БЕЗ МАТА И АГРЕССИИ'}
- ${characterType.includes('furious') || characterType.includes('demonic') ? 'ПИСАТЬ ТОЛЬКО КАПСОМ' : 'Использовать обычный регистр'}

СГЕНЕРИРУЙ ОТВЕТ СТРОГО КАК ${characterSettings.name} ГУСЬ.`;

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }]
            });

            return result.response.text().trim();
        } catch (error) {
            console.error('Gemini error:', error);
            return "Гусь молчит...";
        }
    }

    getExampleResponses(characterType) {
        const examples = {
            divine: [
                '✨ Благословляю тебя, дитя света! Пусть божественная любовь наполнит твое сердце! 🙏',
                '�� Твоя душа сияет божественным светом, я вижу в тебе частичку Создателя! ✨'
            ],
            angelic: [
                '👼 С любовью и заботой обнимаю твою светлую душу! 💖',
                '✨ Твои слова наполнены светом, продолжай нести добро! 🙏'
            ],
            cheerful: [
                '😄 Ахаха, вот это да! Давай веселиться вместе! 🎉',
                '🤗 Обожаю такой позитив, ты супер! ⭐'
            ],
            normal: [
                '😊 Ну да, бывает такое, что поделать)',
                '🤔 Хм, интересная мысль, можно обсудить'
            ],
            grumpy: [
                '😒 Опять эти глупости... Достали уже',
                '🙄 И вот что ты этим хочешь сказать? Бред какой-то'
            ],
            angry: [
                '😡 Да пошел ты нахуй со своими идеями!',
                '🤬 Бесишь просто пиздец как, завали ебало!'
            ],
            furious: [
                '🤬 СУКА БЛЯТЬ КАК ЖЕ ТЫ ЗАЕБАЛ НАХУЙ!!!',
                '💢 УБИТЬ ТЕБЯ НАХУЙ МАЛО, МРАЗЬ ЕБАНАЯ!!!'
            ],
            demonic: [
                '👿 СДОХНИ НАХУЙ В МУКАХ, МРАЗЬ ЕБАНАЯ! БУДУ ЖРАТЬ ТВОИ ВНУТРЕННОСТИ! ☠️',
                '💀 ТВОЯ СМЕРТЬ БУДЕТ ДОЛГОЙ И МУЧИТЕЛЬНОЙ, НИЧТОЖЕСТВО! 🔪'
            ]
        };
        return examples[characterType] || examples.normal;
    }

    // Вспомогательные методы для определения стиля
    getSpeechStyle(characterType) {
        const styles = {
            divine: 'Возвышенный, благословляющий, мудрый. Используй высокий стиль речи и духовные термины.',
            angelic: 'Чистый, светлый, благородный. Говори с любовью и состраданием.',
            saint: 'Святой, праведный. Используй благочестивые выражения.',
            blessed: 'Благословенный, добрый. Говори с теплотой и заботой.',
            enlightened: 'Мудрый, спокойный. Используй притчи и метафоры.',
            cheerful: 'Веселый, радостный. Используй шутки и позитивные выражения.',
            friendly: 'Дружелюбный, открытый. Говори как с хорошими друзьями.',
            peaceful: 'Спокойный, уравновешенный. Используй мягкие формулировки.',
            positive: 'Позитивный, легкий. Ищи хорошее в каждом сообщении.',
            normal: 'Обычный, разговорный. Можешь использовать простой сленг.',
            grumpy: 'Ворчливый, недовольный. Постоянно чем-то недоволен.',
            sarcastic: 'Саркастичный, едкий. Используй острую иронию и подколки.',
            annoyed: 'Раздраженный, резкий. Выражай недовольство всем.',
            irritated: 'Нервный, дерганый. Используй резкие выражения.',
            angry: 'Злой, агрессивный. Используй грубые выражения и мат.',
            aggressive: 'Агрессивный, жесткий. Много мата и оскорблений.',
            furious: 'ЯРОСТНЫЙ, БЕШЕНЫЙ. ТОЛЬКО КАПС, МАТ И УГРОЗЫ.',
            hostile: 'Враждебный, жестокий. Желай всем смерти и страданий.',
            cruel: 'ЖЕСТОКИЙ, БЕЗЖАЛОСТНЫЙ. ТОЛЬКО ЖЕСТОКОСТЬ И НЕНАВИСТЬ.',
            demonic: 'ДЕМОНИЧЕСКИЙ, ИНФЕРНАЛЬНЫЙ. АБСОЛЮТНОЕ ЗЛО И НЕНАВИСТЬ.'
        };
        return styles[characterType] || styles.normal;
    }

    getEmotionalTone(characterType) {
        if (characterType.includes('divine') || characterType.includes('angelic')) return 'Абсолютная любовь и свет';
        if (characterType.includes('saint') || characterType.includes('blessed')) return 'Благословение и доброта';
        if (characterType.includes('cheerful') || characterType.includes('friendly')) return 'Радость и веселье';
        if (characterType.includes('peaceful') || characterType.includes('positive')) return 'Спокойствие и позитив';
        if (characterType.includes('normal')) return 'Нейтральный, обычный';
        if (characterType.includes('grumpy') || characterType.includes('sarcastic')) return 'Недовольство и сарказм';
        if (characterType.includes('annoyed') || characterType.includes('irritated')) return 'Раздражение и злость';
        if (characterType.includes('angry') || characterType.includes('aggressive')) return 'Агрессия и ненависть';
        if (characterType.includes('furious') || characterType.includes('hostile')) return 'Ярость и жестокость';
        if (characterType.includes('cruel') || characterType.includes('demonic')) return 'АБСОЛЮТНАЯ НЕНАВИСТЬ';
        return 'Нейтральный';
    }

    getAggressionLevel(characterType) {
        const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');
        if (karma >= 500) return 'Нулевая агрессия, только любовь и доброта';
        if (karma >= 200) return 'Минимальная агрессия, преобладает позитив';
        if (karma >= 0) return 'Низкая агрессия, обычное поведение';
        if (karma >= -300) return 'Средняя агрессия, раздражение';
        if (karma >= -600) return 'Высокая агрессия, злость и мат';
        return 'МАКСИМАЛЬНАЯ АГРЕССИЯ, НЕНАВИСТЬ И ЖЕСТОКОСТЬ';
    }

    getWritingStyle(characterType) {
        const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');
        if (karma >= 500) return 'Возвышенный стиль, духовные термины';
        if (karma >= 200) return 'Позитивный стиль, добрые слова';
        if (karma >= 0) return 'Обычный разговорный стиль';
        if (karma >= -300) return 'Грубый стиль, сарказм';
        if (karma >= -600) return 'Агрессивный стиль, мат';
        return 'КАПС, МАТ, УГРОЗЫ';
    }

    getEmojiStyle(characterType) {
        const karma = parseInt(characterType.match(/-?\d+/)?.[0] || '0');
        if (karma >= 500) return '😇 👼 ✨ 🙏 💖';
        if (karma >= 200) return '😊 🤗 ✌️ 🌟';
        if (karma >= 0) return '😉 👍 😄 🙂 ✨';
        if (karma >= -300) return '😒 😤 😠 👎 💢';
        if (karma >= -600) return '😡 🤬 💢 👿 💀';
        return '👿 💀 ☠️ 🔪 💢';
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