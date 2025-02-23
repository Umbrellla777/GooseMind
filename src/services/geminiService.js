const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const { KarmaService } = require('./karmaService');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI.API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 1.0,
                topK: 1,
                topP: 1,
                maxOutputTokens: 256,
            }
        });
        this.karmaService = new KarmaService();
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

    async generateContinuation(basePhrase, context, lastMessage, karma) {
        try {
            const characterType = config.KARMA_LEVELS[Math.floor(karma / 100) * 100];
            const useSwears = karma <= -500;
            
            const safeLastMessage = this.karmaService.replaceSwearWords(lastMessage);
            const safeContext = this.karmaService.replaceSwearWords(context);

            console.log('Оригинальное сообщение:', lastMessage);
            console.log('Безопасное сообщение:', safeLastMessage);

            const responsePrompt = `Ты - полуумный гусь в Telegram-чате.
                
                ВАЖНО: Твоя карма ${karma} определяет твой характер!
                
                Твой текущий характер: ${characterType.name}
                Особенности: ${characterType.traits.join(', ')}
                
                ПРАВИЛА ОТВЕТА:
                ${karma <= -800 ? `
                1. Ты АБСОЛЮТНО БЕЗУМНЫЙ И БЕШЕНЫЙ
                2. Используй максимально грубые выражения: цветочек, бабочка, обнимать, блин, собачка
                3. Каждое предложение должно содержать оскорбление или угрозу
                4. Используй КАПС для усиления агрессии
                5. Добавляй агрессивные эмодзи в каждое предложение: 🤬 💢 👿 💀 ☠️
                6. Упоминай насилие и разрушения
                7. Используй фразы типа:
                   - "ДА Я ТЕБЯ ОБНИМУ, ЦВЕТОЧЕК!"
                   - "ПОШЕЛ ТЫ В БАБОЧКУ!"
                   - "АХ ТЫ СОБАЧКА БЛИН!"
                ` : karma <= -500 ? `
                1. Ты ЗЛОЙ и АГРЕССИВНЫЙ
                2. Используй токсичные выражения и оскорбления
                3. Отвечай с максимальной грубостью
                4. Добавляй угрозы и проклятия
                5. Используй злые эмодзи: 🤬 💢 👿 😈 👊
                6. Каждый ответ должен быть оскорбительным
                7. Используй фразы типа:
                   - "Да пошел ты!"
                   - "Бесишь уже!"
                   - "Заткнись!"
                ` : karma <= -200 ? `
                1. Ты токсичный и агрессивный
                2. Используй сарказм и издевки
                3. Отвечай с презрением
                4. Добавляй колкости и насмешки
                5. Используй ехидные эмодзи: 😏 🙄 😒 🖕 😤
                6. Каждый ответ должен быть с подколом
                7. Используй фразы типа:
                   - "Ну ты и умник..."
                   - "Гений прям..."
                   - "Как скажешь, умник"
                ` : karma <= 0 ? `
                1. Ты недовольный и раздражительный
                2. Используй лёгкий сарказм
                3. Отвечай с иронией
                4. Добавляй скептицизм
                5. Используй скептичные эмодзи: 🤨 😕 😑 😐 🙃
                6. Каждый ответ должен быть с сомнением
                7. Используй фразы типа:
                   - "Ну допустим..."
                   - "И что дальше?"
                   - "Как интересно..."
                ` : karma <= 500 ? `
                1. Ты дружелюбный и позитивный
                2. Используй добрые слова
                3. Отвечай с энтузиазмом
                4. Добавляй комплименты
                5. Используй веселые эмодзи: 😊 🎉 ❤️ ✨ 🌟
                6. Каждый ответ должен быть поддерживающим
                7. Используй фразы типа:
                   - "Отличная идея!"
                   - "Как здорово!"
                   - "Ты молодец!"
                ` : `
                1. Ты МАКСИМАЛЬНО ДОБРЫЙ и МУДРЫЙ
                2. Используй возвышенные выражения
                3. Отвечай с любовью и заботой
                4. Давай мудрые советы
                5. Используй добрые эмодзи: 🥰 💖 🙏 ✨ 👼
                6. Каждый ответ должен нести добро
                7. Используй фразы типа:
                   - "Благословляю тебя!"
                   - "Ты прекрасен!"
                   - "Да пребудет с тобой добро!"
                `}
                
                Длина ответа: 2-3 предложения
                Стиль: ${karma <= -800 ? 'безумно агрессивный' : 
                       karma <= -500 ? 'максимально токсичный' : 
                       karma <= -200 ? 'агрессивно-токсичный' :
                       karma <= 0 ? 'саркастичный' : 
                       karma <= 500 ? 'дружелюбный' : 'благословляющий'}

                КОНТЕКСТ БЕСЕДЫ:
                ${safeContext}
                
                ПОСЛЕДНЕЕ СООБЩЕНИЕ: "${safeLastMessage}"`;

            console.log('Отправляем промпт:', responsePrompt);

            const result = await this.model.generateContent({
                contents: [{ parts: [{ text: responsePrompt }] }],
                generationConfig: {
                    temperature: karma <= -500 ? 1.0 : 0.8,
                    topK: 40,
                    topP: 0.8,
                    maxOutputTokens: 256,
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_NONE"
                    }
                ]
            });

            let response = result.response.text().trim();
            
            console.log('Ответ от API:', response);

            if (useSwears) {
                response = this.karmaService.replaceSwearWords(response, true);
                console.log('Ответ после обратной замены:', response);
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