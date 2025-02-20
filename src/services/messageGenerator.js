const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const PorterStemmerRu = natural.PorterStemmerRu;

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
                relevance: this.calculateRelevance(word, Array.from(data.contexts).join(' '), inputStems)
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

    calculateRelevance(word, context, inputStems) {
        let relevance = 0;
        const wordStem = this.stemmer.stem(word);
        const contextWords = this.tokenizer.tokenize(context);
        const contextStems = contextWords.map(w => this.stemmer.stem(w));
        
        // Проверяем совпадение корней слов
        if (inputStems.includes(wordStem)) {
            relevance += 2;
        }

        // Проверяем контекстные связи
        inputStems.forEach(stem => {
            if (contextStems.includes(stem)) {
                relevance += 1;
            }
        });
        
        return relevance;
    }

    generateSentence(wordMap) {
        const sentence = [];
        const words = Array.from(wordMap.keys());
        
        // Если слов мало, используем fallback
        if (words.length < 10) {
            return this.generateFallbackSentence();
        }

        // Начинаем предложение со случайного слова, меньше опираясь на релевантность
        let currentWord = this.selectStartWord(words, wordMap);
        sentence.push(currentWord);

        const targetLength = this.getWeightedRandomLength();
        let repeatedWords = 0;
        const maxRepeats = 2; // Максимальное количество повторений слов

        while (sentence.length < targetLength) {
            const wordData = wordMap.get(currentWord);
            let nextWord = null;
            
            // Пробуем получить следующее слово из контекста
            if (wordData?.nextWords.size > 0) {
                const nextWords = Array.from(wordData.nextWords);
                nextWord = this.selectRandomWord(nextWords);
                
                // Проверяем, не слишком ли часто повторяется слово
                if (sentence.filter(w => w === nextWord).length >= maxRepeats) {
                    nextWord = null;
                }
            }

            // Если не нашли подходящее слово в контексте, выбираем случайное
            if (!nextWord) {
                nextWord = this.selectNextWord(words, sentence, maxRepeats);
            }

            if (nextWord) {
                sentence.push(nextWord);
                currentWord = nextWord;
            } else {
                break;
            }
        }

        return this.cleanupSentence(sentence);
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

    enhanceSentence(sentence) {
        if (!sentence || sentence.length === 0) {
            return "Мне нечего сказать...";
        }

        let result = sentence.join(' ').trim();
        result = result.charAt(0).toUpperCase() + result.slice(1);

        const punctuation = ['.', '!', '...', '?'];
        result += punctuation[Math.floor(Math.random() * punctuation.length)];

        return result;
    }

    async generateResponse(message) {
        try {
            // Проверяем содержимое базы
            await this.checkDatabaseContent(message.chat.id);

            const wordMap = await this.getWordsFromDatabase(message.chat.id, message.text);
            if (wordMap.size === 0) {
                return "Мне нечего сказать... (база данных пуста)";
            }

            const sentence = this.generateSentence(wordMap);
            return this.enhanceSentence(sentence);
        } catch (error) {
            console.error('Error generating response:', error);
            return "Произошла ошибка при генерации ответа.";
        }
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
}

module.exports = { MessageGenerator }; 