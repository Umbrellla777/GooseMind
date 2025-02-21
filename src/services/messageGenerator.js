const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const PorterStemmerRu = natural.PorterStemmerRu;
const { GeminiService } = require('./geminiService');
const config = require('../config');

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
        // Возвращаем пустую карту слов
        return new Map();
    }

    calculateRelevance(word, context, inputStems, messageContext) {
        let relevance = 0;
        const wordStem = this.stemmer.stem(word);
        
        // Повышаем релевантность матов для более частого их использования
        if (this.isSwearWord(word)) {
            if (config.SWEAR_MULTIPLIER === 0) {
                return -1;
            }
            relevance += 2 * config.SWEAR_MULTIPLIER;
        }
        
        // Базовая релевантность
        if (inputStems.includes(wordStem)) {
            relevance += 2;
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
        // В начале генерации определяем, будут ли маты в этом предложении
        const useSwears = Math.random() < config.SWEAR_CHANCE;
        
        const sentence = [];
        const words = Array.from(wordMap.keys());
        
        if (words.length < 2) {
            return this.generateFallbackSentence();
        }

        // Фильтруем слова в зависимости от решения использовать маты
        const availableWords = useSwears 
            ? words 
            : words.filter(word => !this.isSwearWord(word));
        
        if (availableWords.length < 2) {
            return this.generateFallbackSentence();
        }

        let currentWord = this.selectStartWord(availableWords, wordMap);
        sentence.push(currentWord);

        // Уменьшаем длину до 3-8 слов
        const targetLength = Math.floor(Math.random() * 5) + 3;

        while (sentence.length < targetLength) {
            const wordData = wordMap.get(currentWord);
            let nextWord = null;
            
            // Выбираем случайное слово из доступных, исключая использованные
            const nextWords = availableWords.filter(word => 
                !sentence.includes(word)
            );
            
            if (nextWords.length === 0) break;
            nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];

            if (nextWord) {
                sentence.push(nextWord);
                currentWord = nextWord;
            } else {
                break;
            }
        }

        // Если получилось слишком короткое предложение, генерируем заново
        if (sentence.length < 3) {
            console.log('Слишком короткое предложение:', sentence);
            return this.generateFallbackSentence();
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
        try {
            // Обновляем контекст для данного чата
            this.updateContext(message);

            // Получаем фразы из БД
            const { data: phrases } = await this.supabase
                .from('phrases')
                .select('phrase')
                .eq('chat_id', message.chat.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!phrases || phrases.length === 0) {
                console.log('Нет фраз в БД');
                return 'Гусь молчит...';
            }

            // Анализируем входное сообщение через Gemini для понимания контекста
            const analysis = await this.gemini.analyzeMessage(message.text);
            
            // Выбираем наиболее подходящие фразы
            const relevantPhrases = phrases
                .map(p => ({
                    phrase: p.phrase,
                    score: this.calculatePhraseRelevance(p.phrase.split(' '), analysis)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)  // Берем топ-3 фразы
                .map(p => p.phrase);

            console.log('Выбранные фразы:', relevantPhrases);

            // Используем Gemini только для связки фраз
            const useSwears = Math.random() < config.SWEAR_CHANCE;
            const response = await this.gemini.generateContinuation(
                relevantPhrases.join(' '), 
                message.text,
                useSwears
            );

            return response;
        } catch (error) {
            console.error('Error in generateLocalResponse:', error);
            return 'Гусь молчит...';
        }
    }

    calculatePhraseRelevance(words, analysis) {
        let score = 0;
        
        // Проверяем каждое слово фразы
        words.forEach(word => {
            // Если слово есть в анализе
            if (analysis.includes(word)) {
                score += 2;
            }
            
            // Учитываем маты
            if (this.isSwearWord(word)) {
                if (config.SWEAR_MULTIPLIER === 0) {
                    score -= 10; // Сильно понижаем рейтинг матов если они отключены
                } else {
                    score += 2 * config.SWEAR_MULTIPLIER;
                }
            }
        });
        
        return score;
    }

    generateFallbackResponse(inputText) {
        const responses = [
            "Интересная мысль! Давайте развивать её дальше.",
            "Хм, нужно подумать над этим...",
            "А что если посмотреть на это с другой стороны?",
            "Забавно, я как раз думал о чём-то похожем!",
            "Это напомнило мне одну историю...",
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }

    async saveMessage(message) {
        try {
            // Сохраняем сообщение
            await this.supabase
                .from('messages')
                .insert({
                    message_id: message.message_id,
                    chat_id: message.chat.id,
                    user_id: message.from.id,
                    text: message.text,
                    timestamp: new Date(message.date * 1000)
                });

            // Разбиваем на словосочетания и сохраняем
            const words = this.tokenizer.tokenize(message.text.toLowerCase());
            if (words.length < 2) return; // Пропускаем короткие сообщения
            
            const phrases = [];
            
            // Собираем фразы по 2-3 слова
            for (let i = 0; i < words.length - 1; i++) {
                phrases.push({
                    chat_id: message.chat.id,
                    phrase: `${words[i]} ${words[i + 1]}`,
                    type: 'general'
                });
                
                if (i < words.length - 2) {
                    phrases.push({
                        chat_id: message.chat.id,
                        phrase: `${words[i]} ${words[i + 1]} ${words[i + 2]}`,
                        type: 'general'
                    });
                }
            }
            
            // Сохраняем фразы в БД
            if (phrases.length > 0) {
                const { error } = await this.supabase
                    .from('phrases')
                    .insert(phrases);
                
                if (error) {
                    console.error('Error saving phrases:', error);
                } else {
                    console.log(`Saved ${phrases.length} phrases to DB`);
                }
            }

        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    async getRecentMessages(chatId) {
        try {
            const { data: phrases } = await this.supabase
                .from('phrases')
                .select('text')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(10);
            
            return phrases || [];
        } catch (error) {
            console.error('Error getting phrases:', error);
            return [];
        }
    }

    extractPhrases(messages) {
        // Теперь фразы уже готовы из БД
        return messages.map(msg => msg.phrase.split(' '));
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
}