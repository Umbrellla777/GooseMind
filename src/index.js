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
        await messageHandler.saveMessage(ctx.message);
        
        // Проверяем упоминание бота
        if (messageHandler.isBotMentioned(ctx.message.text)) {
            const response = await messageGenerator.generateResponse(ctx.message);
            await ctx.reply(response);
            return;
        }
        
        // Проверяем ответ на сообщение бота
        if (ctx.message.reply_to_message?.from?.id === ctx.botInfo.id) {
            const response = await messageGenerator.generateResponse(ctx.message);
            await ctx.reply(response);
            return;
        }
        
        // Случайная генерация сообщений и реакций
        if (Math.random() < config.RESPONSE_PROBABILITY / 100) {
            const response = await messageGenerator.generateResponse(ctx.message);
            await ctx.reply(response);
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
        // Проверяем ошибку на миграцию чата
        if (error.response?.parameters?.migrate_to_chat_id) {
            const newChatId = error.response.parameters.migrate_to_chat_id;
            console.log(`Retrying with new chat ID: ${newChatId}`);
            // Обновляем ID чата и пробуем снова
            ctx.chat.id = newChatId;
            return ctx.reply(error.on.payload.text);
        }
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
            await ctx.telegram.answerCallbackQuery(
                ctx.callbackQuery.id,
                'Только @Umbrellla777 может использовать эти кнопки'
            );
            return;
        }

        switch (action) {
            case 'set_probability':
                awaitingProbability = true;
                await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, 'Введите новую вероятность');
                await ctx.reply(
                    '📊 Введите новую вероятность ответа (от 1 до 100%).\n' +
                    'Например: 10 - ответ на 10% сообщений\n' +
                    'Текущее значение: ' + config.RESPONSE_PROBABILITY + '%'
                );
                break;

            case 'set_reaction_probability':
                awaitingReactionProbability = true;
                await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, 'Введите новую вероятность реакций');
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
                    await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, `Маты ${status}`);
                } catch (error) {
                    if (error.description?.includes('message is not modified')) {
                        await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, `Маты ${status}`);
                    } else {
                        throw error;
                    }
                }
                break;

            case 'clear_db':
                await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, 'Очистка базы данных...');
                await messageHandler.clearDatabase();
                await ctx.reply('✅ База данных успешно очищена!');
                break;

            default:
                await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, 'Неизвестное действие');
        }
    } catch (error) {
        console.error('Ошибка обработки callback:', error);
        try {
            await ctx.telegram.answerCallbackQuery(
                ctx.callbackQuery.id,
                'Произошла ошибка'
            ).catch(() => {});
            await ctx.reply('Произошла ошибка: ' + error.message).catch(() => {});
        } catch (e) {
            console.error('Ошибка отправки уведомления об ошибке:', e);
        }
    }
}

// Регистрируем обработчики
bot.action('set_probability', ctx => handleCallback(ctx, 'set_probability'));
bot.action('set_reaction_probability', ctx => handleCallback(ctx, 'set_reaction_probability'));
bot.action('toggle_swears', ctx => handleCallback(ctx, 'toggle_swears'));
bot.action('clear_db', ctx => handleCallback(ctx, 'clear_db'));

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка Telegraf:', err.message);
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ETELEGRAM') {
        isConnected = false;
        reconnect();
    }
    
    if (ctx?.from?.username === 'Umbrellla777') {
        ctx.reply('Произошла ошибка в работе бота: ' + err.message)
            .catch(e => console.error('Ошибка отправки сообщения об ошибке:', e.message));
    }
});

// Запуск бота с обработкой ошибок
async function startBot() {
    try {
        await bot.launch();
        console.log('Бот запущен');
        isConnected = true;
    } catch (error) {
        console.error('Ошибка при запуске бота:', error.message);
        isConnected = false;
        setTimeout(startBot, reconnectInterval);
    }
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('Выключение бота...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('Выключение бота...');
    bot.stop('SIGTERM');
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанная ошибка в Promise:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Необработанная ошибка:', error);
}); 