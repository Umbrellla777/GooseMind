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
        const useSwears = Math.random() < config.SWEAR_CHANCE / 100;
        
        const sentence = [];
        const words = Array.from(wordMap.keys());
        
        // Требуем минимум 3 реальных слова из БД
        if (words.length < 3) {
            console.log('Недостаточно слов в БД:', words);
            return this.generateFallbackSentence();
        }

        // Фильтруем слова в зависимости от решения использовать маты
        const availableWords = useSwears 
            ? words 
            : words.filter(word => !this.isSwearWord(word));
        
        if (availableWords.length < 3) {
            console.log('Недостаточно доступных слов после фильтрации:', availableWords);
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

            // Получаем фразы из БД с учетом матов
            const { data: phrases } = await this.supabase
                .from('phrases')
                .select('*')
                .eq('chat_id', message.chat.id)
                .eq('has_swear', Math.random() < config.SWEAR_CHANCE / 100)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!phrases || phrases.length === 0) {
                console.log('Нет фраз в БД');
                return 'Гусь молчит...';
            }

            // Группируем фразы по типам
            const phrasesByType = {
                adj_noun: phrases.filter(p => p.type === 'adj_noun'),
                noun_noun: phrases.filter(p => p.type === 'noun_noun'),
                verb_noun: phrases.filter(p => p.type === 'verb_noun'),
                adv_verb: phrases.filter(p => p.type === 'adv_verb'),
                general: phrases.filter(p => p.type === 'general')
            };

            // Строим предложение из фраз
            const sentence = [];
            
            // Начинаем с существительного или прилагательного + существительного
            const startPhrases = [...phrasesByType.adj_noun, ...phrasesByType.noun_noun];
            if (startPhrases.length > 0) {
                sentence.push(startPhrases[Math.floor(Math.random() * startPhrases.length)].phrase);
            }
            
            // Добавляем глагол с существительным или наречием
            const actionPhrases = [...phrasesByType.verb_noun, ...phrasesByType.adv_verb];
            if (actionPhrases.length > 0) {
                sentence.push(actionPhrases[Math.floor(Math.random() * actionPhrases.length)].phrase);
            }
            
            // Если предложение слишком короткое, добавляем общую фразу
            if (sentence.length < 2 && phrasesByType.general.length > 0) {
                sentence.push(phrasesByType.general[Math.floor(Math.random() * phrasesByType.general.length)].phrase);
            }

            if (sentence.length === 0) {
                return 'Гусь молчит...';
            }

            // Используем Gemini только для связки фраз
            const response = await this.gemini.generateContinuation(
                sentence.join(' '), 
                message.text,
                Math.random() < config.SWEAR_CHANCE / 100
            );

            console.log('Исходные фразы:', sentence);
            console.log('Сгенерированный ответ:', response);

            return response;
        } catch (error) {
            console.error('Error in generateLocalResponse:', error);
            return 'Гусь молчит...';
        }
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
        return "Гусь молчит...";
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
        // Возвращаем простое сообщение, если в БД недостаточно слов
        return ['Гусь', 'учится', 'говорить'];
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
                    // Пропускаем маты если они отключены
                    if (config.SWEAR_MULTIPLIER === 0) {
                        wordFrequency.delete(word);
                        return;
                    }
                    wordFrequency.set(word, (wordFrequency.get(word) || 0) + config.SWEAR_MULTIPLIER);
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

    selectRelevantPhrases(phrases, inputText) {
        // Анализируем входной текст
        const inputWords = this.tokenizer.tokenize(inputText.toLowerCase());
        const inputStems = inputWords.map(word => this.stemmer.stem(word));

        // Оцениваем релевантность каждой фразы
        const scoredPhrases = phrases.map(phrase => ({
            phrase,
            score: this.calculatePhraseRelevance(phrase, inputStems)
        }));

        // Сортируем и выбираем топ-2 фразы
        return scoredPhrases
            .sort((a, b) => b.score - a.score)
            .slice(0, 2)
            .map(item => item.phrase);
    }

    calculatePhraseRelevance(phrase, inputStems) {
        let score = 0;
        phrase.forEach(word => {
            const wordStem = this.stemmer.stem(word);
            if (inputStems.includes(wordStem)) {
                score += 2;
            }
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

    async generateContinuation(phrases, inputText) {
        // Объединяем фразы в строку
        const baseText = phrases.map(phrase => phrase.join(' ')).join(' ');
        
        // Генерируем продолжение через Gemini
        const useSwears = Math.random() < config.SWEAR_CHANCE / 100;
        const continuation = await this.gemini.generateContinuation(
            baseText,
            inputText,
            useSwears
        );
        
        return continuation;
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

            // Токенизация с сохранением знаков препинания
            const text = message.text.toLowerCase();
            const words = text.match(/[а-яё]+|[.,!?;:]/g) || [];
            
            const phrases = [];
            
            // Анализируем каждое слово и формируем словосочетания
            for (let i = 0; i < words.length - 1; i++) {
                const currentWord = words[i];
                // Пропускаем знаки препинания как первое слово
                if (/[.,!?;:]/.test(currentWord)) continue;
                
                // Ищем следующее слово (пропуская знаки препинания)
                let nextIndex = i + 1;
                while (nextIndex < words.length && /[.,!?;:]/.test(words[nextIndex])) {
                    nextIndex++;
                }
                if (nextIndex >= words.length) break;
                
                const nextWord = words[nextIndex];
                
                // Формируем словосочетания на основе частей речи
                // (здесь можно добавить более сложную логику определения частей речи)
                if (this.isNoun(currentWord)) {
                    // существительное + прилагательное
                    if (this.isAdjective(nextWord)) {
                        phrases.push({
                            chat_id: message.chat.id,
                            phrase: `${nextWord} ${currentWord}`, // прил + сущ
                            type: 'adj_noun',
                            has_swear: this.hasSwearWord([currentWord, nextWord])
                        });
                    }
                    // существительное + существительное
                    if (this.isNoun(nextWord)) {
                        phrases.push({
                            chat_id: message.chat.id,
                            phrase: `${currentWord} ${nextWord}`,
                            type: 'noun_noun',
                            has_swear: this.hasSwearWord([currentWord, nextWord])
                        });
                    }
                }
                
                if (this.isVerb(currentWord)) {
                    // глагол + существительное
                    if (this.isNoun(nextWord)) {
                        phrases.push({
                            chat_id: message.chat.id,
                            phrase: `${currentWord} ${nextWord}`,
                            type: 'verb_noun',
                            has_swear: this.hasSwearWord([currentWord, nextWord])
                        });
                    }
                    // глагол + наречие
                    if (this.isAdverb(nextWord)) {
                        phrases.push({
                            chat_id: message.chat.id,
                            phrase: `${nextWord} ${currentWord}`, // нареч + глаг
                            type: 'adv_verb',
                            has_swear: this.hasSwearWord([currentWord, nextWord])
                        });
                    }
                }
                
                // Если не удалось определить часть речи, сохраняем как общую фразу
                if (phrases.length === 0) {
                    phrases.push({
                        chat_id: message.chat.id,
                        phrase: `${currentWord} ${nextWord}`,
                        type: 'general',
                        has_swear: this.hasSwearWord([currentWord, nextWord])
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
                }
            }

        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    // Простые проверки на части речи (можно расширить)
    isNoun(word) {
        // Типичные окончания существительных
        return /[аеёиоуыэюя]$|[аеёиоуыэюя][йхм]$|[аеёиоуыэюя]ми$|ость$|ство$|тель$/i.test(word);
    }

    isVerb(word) {
        // Типичные окончания глаголов
        return /ть$|ет$|ут$|ат$|ит$|ют$|ал$|ил$|ел$/i.test(word);
    }

    isAdjective(word) {
        // Типичные окончания прилагательных
        return /[ыи]й$|[ая]я$|[ое]е$|ого$|его$|ому$|ему$/i.test(word);
    }

    isAdverb(word) {
        // Типичные окончания наречий
        return /о$|[аеиу]$|ски$/i.test(word);
    }

    hasSwearWord(words) {
        return words.some(word => this.isSwearWord(word));
    }
}

module.exports = { MessageGenerator }; 