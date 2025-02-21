const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { MessageHandler } = require('./handlers/messageHandler');
const { MessageGenerator } = require('./services/messageGenerator');
const config = require('./config');

// Настройки для бота
const botOptions = {
    telegram: {
        apiRoot: 'https://api.telegram.org',
        apiTimeout: 30000, // уменьшим таймаут до 30 секунд
        webhookReply: false
    },
    handlerTimeout: 30000 // уменьшим общий таймаут
};

const bot = new Telegraf(config.BOT_TOKEN, botOptions);
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

const messageHandler = new MessageHandler(supabase);
const messageGenerator = new MessageGenerator(supabase);

// Хранение состояния ожидания ввода вероятности
let awaitingProbability = false;
let awaitingReactionProbability = false;
let awaitingSwearToggle = false;

// Добавим обработку разрыва соединения
let isConnected = true;
const reconnectInterval = 5000; // 5 секунд между попытками

async function reconnect() {
    try {
        if (!isConnected) {
            console.log('Попытка переподключения к Telegram...');
            await bot.telegram.getMe();
            isConnected = true;
            console.log('Успешно переподключились к Telegram');
        }
    } catch (error) {
        isConnected = false;
        console.error('Ошибка при переподключении:', error.message);
        setTimeout(reconnect, reconnectInterval);
    }
}

// Обработка новых сообщений
bot.on('text', async (ctx) => {
    try {
        // Проверяем, не был ли чат обновлен до супергруппы
        if (ctx.message?.migrate_to_chat_id) {
            console.log(`Chat ${ctx.chat.id} migrated to ${ctx.message.migrate_to_chat_id}`);
            return;
        }

        // Проверяем команды настроек гуся
        if (ctx.message.text === '/gs' || ctx.message.text === '/goosemind') {
            if (ctx.message.from.username.toLowerCase() !== 'umbrellla777') {
                return ctx.reply('Только @Umbrellla777 может использовать эту команду');
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚡️ Частота ответа', callback_data: 'set_probability' },
                        { text: '😎 Частота реакций', callback_data: 'set_reaction_probability' }
                    ],
                    [
                        { text: config.SWEAR_ENABLED ? '🤬 Маты: ВКЛ' : '😇 Маты: ВЫКЛ', callback_data: 'toggle_swears' }
                    ],
                    [
                        { text: '🗑 Очистить память', callback_data: 'clear_db' }
                    ]
                ]
            };

            await ctx.reply(
                `Текущие настройки Полуумного Гуся:\n` +
                `Вероятность ответа: ${config.RESPONSE_PROBABILITY}%\n` +
                `Вероятность реакции: ${config.REACTION_PROBABILITY}%\n` +
                `Маты: ${config.SWEAR_ENABLED ? 'включены' : 'выключены'}`,
                { reply_markup: keyboard }
            );
            return;
        }

        // Проверяем, ожидаем ли ввод вероятности ответов
        if (awaitingProbability && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const prob = parseInt(ctx.message.text);
            if (!isNaN(prob) && prob >= 1 && prob <= 100) {
                config.RESPONSE_PROBABILITY = prob;
                await ctx.reply(`✅ Вероятность ответа установлена на ${prob}%`);
                awaitingProbability = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 1 до 100');
                return;
            }
        }

        // Добавляем проверку для вероятности реакций
        if (awaitingReactionProbability && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const prob = parseInt(ctx.message.text);
            if (!isNaN(prob) && prob >= 1 && prob <= 100) {
                config.REACTION_PROBABILITY = prob;
                await ctx.reply(`✅ Вероятность реакций установлена на ${prob}%`);
                awaitingReactionProbability = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 1 до 100');
                return;
            }
        }

        // Сохраняем сообщение
        try {
            const result = await messageGenerator.saveMessage(ctx.message);
            if (!result) {
                console.log('Пробуем прямое сохранение...');
                await messageGenerator.saveMessageDirect(ctx.message);
            }
        } catch (saveError) {
            console.error('Ошибка при сохранении сообщения:', saveError);
        }
        
        // Проверяем, является ли сообщение ответом на сообщение бота
        const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.botInfo.id;
        
        // Проверяем вероятность ответа или упоминание бота
        const shouldRespond = isReplyToBot || 
                            messageHandler.isBotMentioned(ctx.message.text) || 
                            Math.random() * 100 < config.RESPONSE_PROBABILITY;

        console.log(`Проверка ответа:`, {
            isReplyToBot,
            isMentioned: messageHandler.isBotMentioned(ctx.message.text),
            probability: config.RESPONSE_PROBABILITY,
            shouldRespond
        });

        if (shouldRespond) {
            console.log('Генерируем ответ...');
            const response = await messageGenerator.generateResponse(ctx.message);
            if (response && response !== "Гусь молчит...") {
                await ctx.reply(response);
            } else {
                console.log('Пустой ответ от генератора');
            }
        } else {
            console.log('Пропускаем сообщение по вероятности');
        }

        // Анализируем сообщение для реакции
        if (Math.random() < config.REACTION_PROBABILITY / 100) {
            const shouldReact = Math.random() < 0.15; // Дополнительная проверка
            if (shouldReact) {
                const reactions = await messageHandler.analyzeForReaction(ctx.message);
                if (reactions && reactions.length > 0) {
                    try {
                        await ctx.telegram.callApi('setMessageReaction', {
                            chat_id: ctx.message.chat.id,
                            message_id: ctx.message.message_id,
                            reaction: reactions.slice(0, 1).map(emoji => ({ // Берем только 1 реакцию
                                type: 'emoji',
                                emoji: emoji
                            })),
                            is_big: Math.random() < 0.1
                        });
                    } catch (error) {
                        console.error('Reaction error:', error);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error processing message:', error);
        if (ctx.message.from.username === 'Umbrellla777') {
            await ctx.reply('Произошла ошибка при обработке сообщения: ' + error.message);
        }
    }
});

// Обработчик кнопок с быстрым ответом
async function handleCallback(ctx, action) {
    try {
        // Проверяем доступ
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            await ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
            return;
        }

        switch (action) {
            case 'set_probability':
                awaitingProbability = true;
                await ctx.answerCbQuery('Введите новую вероятность');
                await ctx.reply(
                    '📊 Введите новую вероятность ответа (от 1 до 100%).\n' +
                    'Например: 10 - ответ на 10% сообщений\n' +
                    'Текущее значение: ' + config.RESPONSE_PROBABILITY + '%'
                );
                break;

            case 'set_reaction_probability':
                awaitingReactionProbability = true;
                await ctx.answerCbQuery('Введите новую вероятность реакций');
                await ctx.reply(
                    '😎 Введите новую вероятность реакций (от 1 до 100%).\n' +
                    'Например: 15 - реакция на 15% сообщений\n' +
                    'Текущее значение: ' + config.REACTION_PROBABILITY + '%'
                );
                break;

            case 'toggle_swears':
                config.SWEAR_ENABLED = !config.SWEAR_ENABLED;
                const status = config.SWEAR_ENABLED ? 'включены' : 'выключены';
                
                try {
                    const newKeyboard = {
                        inline_keyboard: [
                            [
                                { text: '⚡️ Частота ответа', callback_data: 'set_probability' },
                                { text: '😎 Частота реакций', callback_data: 'set_reaction_probability' }
                            ],
                            [
                                { 
                                    text: config.SWEAR_ENABLED ? '🤬 Маты: ВКЛ' : '😇 Маты: ВЫКЛ',
                                    callback_data: 'toggle_swears'
                                }
                            ],
                            [
                                { text: '🗑 Очистить память', callback_data: 'clear_db' }
                            ]
                        ]
                    };

                    const newText = 
                        `Текущие настройки Полуумного Гуся:\n` +
                        `Вероятность ответа: ${config.RESPONSE_PROBABILITY}%\n` +
                        `Вероятность реакции: ${config.REACTION_PROBABILITY}%\n` +
                        `Маты: ${status}`;

                    await ctx.editMessageText(newText, { reply_markup: newKeyboard });
                    await ctx.answerCbQuery(`Маты ${status}`);
                } catch (error) {
                    if (error.description?.includes('message is not modified')) {
                        await ctx.answerCbQuery(`Маты ${status}`);
                    } else {
                        throw error;
                    }
                }
                break;

            case 'clear_db':
                await ctx.answerCbQuery('Очистка базы данных...');
                await messageHandler.clearDatabase();
                await ctx.reply('✅ База данных успешно очищена!');
                break;

            default:
                await ctx.answerCbQuery('Неизвестное действие');
        }
    } catch (error) {
        console.error('Error processing callback:', error);
        await ctx.answerCbQuery('Произошла ошибка при обработке запроса');
    }
}

// Обработчик кнопок с быстрым ответом
bot.on('callback_query', handleCallback);

// Запуск бота
bot.launch();

// Добавим обработку разрыва соединения
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    bot.telegram.getMe().then(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    bot.telegram.getMe().then(() => {
        process.exit(0);
    });
});