const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const PorterStemmerRu = natural.PorterStemmerRu;
const { GeminiService } = require('./geminiService');

class MessageGenerator {
    constructor(supabase) {
        this.supabase = supabase;
        this.minWords = 1;
        this.maxWords = 40;
        
        // Для работы с русским языком
        this.tokenizer = new natural.WordTokenizer();
        this.stemmer = PorterStemmerRu;
        
        // Кэш для слов
        this.wordsCache = new Map();
        this.lastCacheUpdate = null;
        this.CACHE_LIFETIME = 5 * 60 * 1000; // 5 минут
        
        // Добавляем историю контекста
        this.contextHistory = new Map(); // chatId -> последние сообщения
        this.MAX_CONTEXT_LENGTH = 5; // Хранить последние 5 сообщений для контекста
        
        this.gemini = new GeminiService();
    }

    async getWordsFromDatabase(chatId, inputText) {
        try {
            // Проверяем кэш
            if (this.isCacheValid()) {
                console.log('Using cached words');
                return this.getRelevantWords(inputText);
            }

            // Получаем все слова из базы одним запросом
            const { data: wordsData } = await this.supabase
                .from('words')
                .select('word, context, message_id')
                .order('created_at', { ascending: false })
                .limit(5000);

            if (!wordsData || wordsData.length === 0) {
                return this.getFallbackWords();
            }

            // Обновляем кэш
            this.updateWordsCache(wordsData);
            
            // Возвращаем релевантные слова
            return this.getRelevantWords(inputText);
        } catch (error) {
            console.error('Error getting words from database:', error);
            return this.getFallbackWords();
        }
    }

    isCacheValid() {
        return this.lastCacheUpdate && 
               (Date.now() - this.lastCacheUpdate) < this.CACHE_LIFETIME &&
               this.wordsCache.size > 0;
    }

    updateWordsCache(wordsData) {
        this.wordsCache.clear();
        const uniqueWords = new Set();
        
        wordsData.forEach(({ word, context }) => {
            uniqueWords.add(word);
            if (!this.wordsCache.has(word)) {
                this.wordsCache.set(word, {
                    contexts: new Set(),
                    nextWords: new Set()
                });
            }
            
            const wordData = this.wordsCache.get(word);
            wordData.contexts.add(context);
            
            // Анализируем следующие слова
            const words = this.tokenizer.tokenize(context);
            const wordIndex = words.indexOf(word);
            if (wordIndex !== -1 && wordIndex < words.length - 1) {
                wordData.nextWords.add(words[wordIndex + 1]);
            }
        });
        
        this.lastCacheUpdate = Date.now();
        console.log(`Кэш обновлен: ${uniqueWords.size} уникальных слов`);
    }

    getRelevantWords(inputText) {
        const inputWords = this.tokenizer.tokenize(inputText.toLowerCase());
        const inputStems = inputWords.map(word => this.stemmer.stem(word));
        
        const wordMap = new Map();
        this.wordsCache.forEach((data, word) => {
            wordMap.set(word, {
                ...data,
                relevance: this.calculateRelevance(word, Array.from(data.contexts).join(' '), inputStems, this.getContext(inputText?.chat?.id))
            });
        });
        
        return wordMap;
    }

    getFallbackWords() {
        // Забавные заготовки для случайной генерации
        const funnyWords = {
            subjects: ['котик', 'программист', 'чайник', 'компьютер', 'хомяк', 'единорог'],
            verbs: ['танцует', 'спит', 'летает', 'мечтает', 'хихикает', 'философствует'],
            adjectives: ['весёлый', 'загадочный', 'пушистый', 'космический', 'шальной'],
            objects: ['пельмени', 'код', 'звёзды', 'мемы', 'печеньки', 'смайлики']
        };

        const wordMap = new Map();
        Object.values(funnyWords).flat().forEach(word => {
            wordMap.set(word, {
                contexts: new Set(['funny']),
                nextWords: new Set(),
                relevance: Math.random()
            });
        });

        return wordMap;
    }

    calculateRelevance(word, context, inputStems, messageContext) {
        let relevance = 0;
        const wordStem = this.stemmer.stem(word);
        
        // Список забавных слов с высоким приоритетом
        const funnyWords = [
            'котик', 'хомяк', 'единорог', 'пельмени', 'печеньки',
            'танцует', 'хихикает', 'мечтает', 'летает',
            'весёлый', 'пушистый', 'загадочный', 'космический',
            'мемы', 'смайлики', 'программист', 'чайник'
        ];
        
        // Повышаем релевантность матов для более частого их использования
        if (this.isSwearWord(word)) {
            relevance += 5; // Высокий приоритет для матов
        }
        
        // Добавляем случайные забавные слова
        const randomFunnyWords = funnyWords
            .sort(() => Math.random() - 0.5)
            .slice(0, 2);
        
        // Повышаем релевантность забавных слов
        if (funnyWords.includes(word.toLowerCase()) || 
            randomFunnyWords.includes(word.toLowerCase())) {
            relevance += 3;
        }

        // Базовая релевантность
        if (inputStems.includes(wordStem)) {
            relevance += 2;
        }

        // Учитываем контекст последних сообщений
        if (messageContext && messageContext.length > 0) {
            const recentMessages = messageContext
                .map(msg => msg.text)
                .join(' ')
                .toLowerCase();
            
            const contextStems = this.tokenizer
                .tokenize(recentMessages)
                .map(w => this.stemmer.stem(w));
            
            // Добавляем релевантность на основе контекста
            if (contextStems.includes(wordStem)) {
                relevance += 0.5;
            }
        }
        
        return relevance;
    }

    isSwearWord(word) {
        // Примерный список матных корней (можно расширить)
        const swearRoots = ['хуй', 'пизд', 'ебл', 'бля', 'сук', 'хер', 'пох', 'бл'];
        const loweredWord = word.toLowerCase();
        return swearRoots.some(root => loweredWord.includes(root));
    }

    generateSentence(wordMap, context) {
        const sentence = [];
        const words = Array.from(wordMap.keys());
        
        if (words.length < 2) {
            return this.generateFallbackSentence();
        }

        let currentWord = this.selectStartWord(words, wordMap);
        sentence.push(currentWord);

        // Уменьшаем длину до 3-8 слов
        const targetLength = Math.floor(Math.random() * 5) + 3;
        let repeatedWords = 0;
        const maxRepeats = 1; // Запрещаем повторения слов

        while (sentence.length < targetLength) {
            const wordData = wordMap.get(currentWord);
            let nextWord = null;
            
            // Выбираем случайное слово из доступных, исключая использованные
            const availableWords = words.filter(word => 
                !sentence.includes(word)
            );
            
            if (availableWords.length === 0) break;
            nextWord = availableWords[Math.floor(Math.random() * availableWords.length)];

            if (nextWord) {
                sentence.push(nextWord);
                currentWord = nextWord;
            } else {
                break;
            }
        }

        return sentence;
    }

    selectRandomWord(words) {
        return words[Math.floor(Math.random() * words.length)];
    }

    selectStartWord(words, wordMap) {
        // Уменьшаем влияние релевантности при выборе первого слова
        if (Math.random() < 0.7) { // 70% случаев берем случайное слово
            return this.selectRandomWord(words);
        }
        
        // В 30% случаев используем релевантность
        const sortedWords = words
            .sort((a, b) => wordMap.get(b).relevance - wordMap.get(a).relevance)
            .slice(0, 5); // Увеличили выборку до топ-5
        
        return sortedWords[Math.floor(Math.random() * sortedWords.length)];
    }

    selectNextWord(words, sentence, maxRepeats) {
        // Фильтруем слова, которые уже слишком часто использовались
        const availableWords = words.filter(word => 
            sentence.filter(w => w === word).length < maxRepeats
        );
        
        if (availableWords.length > 0) {
            return availableWords[Math.floor(Math.random() * availableWords.length)];
        }
        return null;
    }

    getWeightedRandomLength() {
        const lambda = 0.2;
        const randomValue = Math.random();
        const length = Math.round(-Math.log(1 - randomValue) / lambda);
        return Math.max(this.minWords, Math.min(this.maxWords, length));
    }

    async enhanceSentence(sentence) {
        if (!sentence || sentence.length === 0) {
            return "Мне нечего сказать...";
        }

        let result = sentence.join(' ').trim();
        result = result.charAt(0).toUpperCase() + result.slice(1);

        const punctuation = ['.', '!', '...', '?'];
        result += punctuation[Math.floor(Math.random() * punctuation.length)];

        // Улучшаем текст с помощью Gemini
        try {
            result = await this.gemini.improveText(result);
        } catch (error) {
            console.error('Error improving text:', error);
        }

        return result;
    }

    async generateResponse(message) {
        try {
            return await this.generateLocalResponse(message);
        } catch (error) {
            console.error('Error in generateResponse:', error);
            return this.generateFallbackResponse(message.text);
        }
    }

    async generateLocalResponse(message) {
        // Обновляем контекст для данного чата
        this.updateContext(message);

        // Анализируем входящее сообщение
        const keywords = await this.gemini.analyzeMessage(message.text);
        
        // Получаем релевантные сообщения из БД
        const relevantMessages = await this.getRelevantMessagesFromDB(keywords);
        
        // Анализируем контекст и релевантные сообщения
        const contextWords = await this.analyzeContextAndMessages(message.text, relevantMessages);
        
        // Добавляем ключевые слова в релевантность
        const wordMap = await this.getWordsFromDatabase(message.chat.id, 
            message.text + ' ' + keywords.join(' ') + ' ' + contextWords.join(' ')
        );

        // Если база пуста - используем заготовленные ответы
        if (wordMap.size === 0) {
            return this.generateFallbackResponse(message.text);
        }

        // Генерируем предложение с учетом контекста
        const sentence = this.generateSentence(wordMap, this.getContext(message.chat.id));
        return this.enhanceSentence(sentence);
    }

    updateContext(message) {
        const chatId = message.chat.id;
        if (!this.contextHistory.has(chatId)) {
            this.contextHistory.set(chatId, []);
        }
        
        const context = this.contextHistory.get(chatId);
        context.push({
            text: message.text,
            timestamp: Date.now()
        });
        
        // Оставляем только последние сообщения
        if (context.length > this.MAX_CONTEXT_LENGTH) {
            context.shift();
        }
    }

    getContext(chatId) {
        return this.contextHistory.get(chatId) || [];
    }

    generateFallbackResponse(inputText) {
        const responses = [
            "Интересная мысль! Давайте развивать её дальше.",
            "Хм, нужно подумать над этим...",
            "А что если посмотреть на это с другой стороны?",
            "Забавно, я как раз думал о чём-то похожем!",
            "Это напомнило мне одну историю...",
        ];
        
        // Выбираем случайный ответ
        return responses[Math.floor(Math.random() * responses.length)];
    }

    async checkDatabaseContent(chatId) {
        try {
            // Получаем количество сообщений для конкретного чата
            const { count: messagesCount } = await this.supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('chat_id', chatId);

            // Получаем количество всех слов
            const { count: wordsCount } = await this.supabase
                .from('words')
                .select('*', { count: 'exact', head: true });

            console.log(`Статистика базы данных для чата ${chatId}:`);
            console.log(`- Сообщений: ${messagesCount || 0}`);
            console.log(`- Всего слов: ${wordsCount || 0}`);

            return {
                messages: messagesCount || 0,
                words: wordsCount || 0
            };
        } catch (error) {
            console.error('Ошибка при проверке базы данных:', error);
            return null;
        }
    }

    cleanupSentence(sentence) {
        // Убираем повторяющиеся слова, идущие подряд
        return sentence.filter((word, index) => word !== sentence[index - 1]);
    }

    generateFallbackSentence() {
        const templates = [
            ['я', 'думаю', 'что'],
            ['возможно', 'стоит'],
            ['интересно', 'а'],
            ['хм', 'давайте', 'подумаем'],
            ['а', 'что', 'если'],
            ['забавно', 'но'],
        ];
        
        const template = templates[Math.floor(Math.random() * templates.length)];
        return [...template, this.selectRandomWord(Array.from(this.wordsCache.keys()))];
    }

    async getRelevantMessagesFromDB(keywords) {
        try {
            // Ищем сообщения, содержащие похожие ключевые слова
            const { data: messages } = await this.supabase
                .from('messages')
                .select('text')
                .textSearch('text', keywords.join(' '))
                .limit(5);
            
            return messages || [];
        } catch (error) {
            console.error('Error getting relevant messages:', error);
            return [];
        }
    }

    async analyzeContextAndMessages(inputText, relevantMessages) {
        try {
            // Собираем все слова из релевантных сообщений
            const allWords = relevantMessages
                .map(msg => this.tokenizer.tokenize(msg.text.toLowerCase()))
                .flat();
            
            // Находим часто встречающиеся слова
            const wordFrequency = new Map();
            allWords.forEach(word => {
                wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
                // Если находим мат, добавляем его с повышенной частотой
                if (this.isSwearWord(word)) {
                    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 3);
                }
            });
            
            // Выбираем топ-5 наиболее частых слов
            const topWords = Array.from(wordFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([word]) => word);
            
            return topWords;
        } catch (error) {
            console.error('Error analyzing context:', error);
            return [];
        }
    }
}

module.exports = { MessageGenerator }; 