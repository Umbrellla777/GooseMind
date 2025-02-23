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
            // Получаем текущую карму чата
            const { data: karmaData } = await this.supabase
                .from('chat_karma')
                .select('karma_value')
                .eq('chat_id', message.chat.id)
                .single();

            const chatKarma = karmaData?.karma_value || 0;

            return await this.generateLocalResponse(message, chatKarma);
        } catch (error) {
            console.error('Error in generateResponse:', error);
            return this.generateFallbackResponse(message.text);
        }
    }

    async generateLocalResponse(message, chatKarma = 0) {
        try {
            // Получаем последние сообщения для контекста
            const { data: recentMessages } = await this.supabase
                .from('messages')
                .select('text, user_id, created_at')
                .eq('chat_id', message.chat.id)
                .order('created_at', { ascending: false })
                .limit(50);

            // Форматируем контекст для лучшего понимания
            const formattedContext = recentMessages
                ?.map(msg => {
                    let speaker;
                    if (msg.user_id === message.botInfo?.id) {
                        speaker = 'Гусь';
                    } else if (msg.user_id === message.from.id) {
                        speaker = 'Собеседник';
                    } else {
                        speaker = 'Участник чата';
                    }
                    return `${speaker}: ${msg.text}`;
                })
                .reverse() // Чтобы сообщения шли в хронологическом порядке
                .join('\n') || '';

            // Сначала пробуем получить фразы из текущего чата
            const { data: chatPhrases } = await this.supabase
                .from('phrases')
                .select('phrase')
                .eq('chat_id', message.chat.id)
                .order('RANDOM()')
                .limit(3);

            let selectedPhrases = chatPhrases?.map(p => p.phrase) || [];
            
            // Если фраз недостаточно, добавляем из других чатов
            if (selectedPhrases.length < 3) {
                const { data: otherPhrases } = await this.supabase
                    .from('phrases')
                    .select('phrase')
                    .neq('chat_id', message.chat.id)
                    .order('RANDOM()')
                    .limit(5);
                
                if (otherPhrases?.length > 0) {
                    selectedPhrases = selectedPhrases.concat(
                        otherPhrases.map(p => p.phrase)
                    ).slice(0, 3);
                }
            }

            let basePhrase = selectedPhrases.join('. ');

            // Если нет фраз для генерации, используем заготовленные фразы
            if (!basePhrase) {
                const defaultPhrases = [
                    "Хм, интересно...",
                    "Давайте поговорим об этом",
                    "А что вы думаете?",
                    "Продолжайте, мне интересно"
                ];
                basePhrase = defaultPhrases[Math.floor(Math.random() * defaultPhrases.length)];
            }

            // Анализируем последнее сообщение для определения темы
            const messageAnalysis = await this.gemini.analyzeMessage(message.text);
            
            // Получаем последнее сообщение бота для сохранения контекста
            const lastBotMessage = recentMessages?.find(msg => msg.user_id === message.botInfo?.id)?.text;

            // Генерируем ответ с учетом кармы
            const response = await this.gemini.generateContinuation(
                basePhrase,
                formattedContext,
                message.text,
                chatKarma,
                messageAnalysis,
                lastBotMessage
            );

            // Проверяем ответ перед возвратом
            if (!response || response === "Гусь молчит...") {
                return "Извините, я задумался... 🤔";
            }

            return response;
        } catch (error) {
            console.error('Error generating response:', error);
            return "Гусь молчит... 🤔";
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

    async getRecentMessages(chatId, limit = 10) {
        try {
            const { data: messages } = await this.supabase
                .from('messages')
                .select('text')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            return messages?.map(m => m.text) || [];
        } catch (error) {
            console.error('Error getting recent messages:', error);
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
            if (!message?.text) {
                console.log('Пропуск пустого сообщения');
                return;
            }

            // Функция для проверки валидности фразы
            const isValidPhrase = (phrase) => {
                // Слишком короткие или длинные
                if (phrase.length <= 2 || phrase.length > 100) return false;

                // Технические паттерны
                if (phrase.match(/\[\d{2}\.\d{2}\.\d{4}/) ||  // Даты
                    phrase.match(/\d{2}:\d{2}/) ||            // Время
                    phrase.includes('[') ||                    // Скобки
                    phrase.includes(']')) {
                    return false;
                }

                // Служебные слова
                const serviceWords = new Set([
                    'а', 'и', 'но', 'да', 'вот', 'как', 'что', 'ну', 'то', 'же', 'бы', 'ли'
                ]);

                // Проверяем, не состоит ли фраза только из служебных слов
                const words = phrase.toLowerCase().split(/\s+/);
                if (words.length === 1) return false; // Одиночные слова
                if (words.every(word => serviceWords.has(word))) return false;

                // Проверяем начало фразы на служебные слова
                if (words.length < 3 && serviceWords.has(words[0])) return false;

                // Проверяем знаки препинания
                if (phrase.endsWith(',') || 
                    phrase.startsWith('-') || 
                    phrase.includes('–') || 
                    phrase.includes('—')) {
                    return false;
                }

                // Проверяем, не является ли фраза вопросом собеседника
                if (phrase.toLowerCase().endsWith('?')) return false;

                return true;
            };

            console.log('Начало сохранения сообщения:', {
                message_id: message.message_id,
                chat_id: message.chat.id,
                text: message.text?.substring(0, 50)
            });

            // Сохраняем чат
            await this.supabase
                .from('chats')
                .upsert({
                    id: message.chat.id,
                    title: message.chat.title || '',
                    type: message.chat.type || 'private'
                });

            // Сохраняем пользователя
            await this.supabase
                .from('users')
                .upsert({
                    id: message.from.id,
                    username: message.from.username || '',
                    first_name: message.from.first_name || '',
                    last_name: message.from.last_name || ''
                });

            // Сохраняем сообщение
            const { data: savedMessage, error: messageError } = await this.supabase
                .from('messages')
                .insert({
                    message_id: message.message_id,
                    chat_id: message.chat.id,
                    user_id: message.from.id,
                    text: message.text,
                    type: 'text'
                })
                .select()
                .single();

            if (messageError) {
                console.error('Ошибка сохранения сообщения:', messageError);
                return null;
            }

            // Разбиваем на фразы с фильтрацией
            const words = message.text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
            const phrases = [];

            for (let i = 0; i < words.length - 1; i++) {
                // Фраза из 2 слов
                const phrase2 = `${words[i]} ${words[i + 1]}`;
                if (isValidPhrase(phrase2)) {
                    phrases.push({
                        chat_id: message.chat.id,
                        message_id: savedMessage.id,
                        phrase: phrase2
                    });
                }

                // Фраза из 3 слов
                if (i < words.length - 2) {
                    const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
                    if (isValidPhrase(phrase3)) {
                        phrases.push({
                            chat_id: message.chat.id,
                            message_id: savedMessage.id,
                            phrase: phrase3
                        });
                    }
                }
            }

            // Сохраняем только валидные фразы
            if (phrases.length > 0) {
                const { error: phrasesError } = await this.supabase
                    .from('phrases')
                    .insert(phrases);

                if (phrasesError) {
                    console.error('Ошибка сохранения фраз:', phrasesError);
                } else {
                    console.log(`Сохранено ${phrases.length} валидных фраз`);
                }
            }

            return savedMessage;
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            return null;
        }
    }

    async getRandomPhrase(chatId) {
        try {
            const { data: phrase } = await this.supabase
                .from('phrases')
                .select('phrase')
                .eq('chat_id', chatId)
                .order('RANDOM()')
                .limit(1)
                .single();

            return phrase?.phrase || null;
        } catch (error) {
            console.error('Error getting random phrase:', error);
            return null;
        }
    }

    async saveMessageDirect(message) {
        try {
            console.log('Начало прямого сохранения сообщения:', {
                text: message.text?.substring(0, 50),
                chat_id: message.chat.id
            });

            // Сохраняем чат
            await this.supabase
                .from('chats')
                .upsert({
                    id: message.chat.id,
                    title: message.chat.title || '',
                    type: message.chat.type || 'private'
                });

            // Сохраняем пользователя
            await this.supabase
                .from('users')
                .upsert({
                    id: message.from.id,
                    username: message.from.username || '',
                    first_name: message.from.first_name || '',
                    last_name: message.from.last_name || ''
                });

            // Сохраняем сообщение
            const { data: savedMessage, error: messageError } = await this.supabase
                .from('messages')
                .insert({
                    message_id: message.message_id,
                    chat_id: message.chat.id,
                    user_id: message.from.id,
                    text: message.text,
                    type: 'text'
                })
                .select()
                .single();

            if (messageError) {
                if (messageError.code === '23505') { // Unique violation
                    console.log('Сообщение уже существует, пропускаем');
                    return null;
                }
                console.error('Ошибка сохранения сообщения:', messageError);
                return null;
            }

            // Разбиваем на фразы
            const words = message.text?.toLowerCase().split(/\s+/).filter(w => w.length > 0) || [];
            const phrases = [];

            for (let i = 0; i < words.length - 1; i++) {
                // Фраза из 2 слов
                phrases.push({
                    chat_id: message.chat.id,
                    message_id: savedMessage.id,
                    phrase: `${words[i]} ${words[i + 1]}`
                });

                // Фраза из 3 слов
                if (i < words.length - 2) {
                    phrases.push({
                        chat_id: message.chat.id,
                        message_id: savedMessage.id,
                        phrase: `${words[i]} ${words[i + 1]} ${words[i + 2]}`
                    });
                }
            }

            // Сохраняем фразы
            if (phrases.length > 0) {
                const { error: phrasesError } = await this.supabase
                    .from('phrases')
                    .insert(phrases);

                if (phrasesError) {
                    console.error('Ошибка сохранения фраз:', phrasesError);
                } else {
                    console.log(`Сохранено ${phrases.length} фраз`);
                }
            }

            return savedMessage;
        } catch (error) {
            console.error('Ошибка прямого сохранения:', error);
            return null;
        }
    }
}

module.exports = { MessageGenerator }; 