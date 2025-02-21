const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { MessageHandler } = require('./handlers/messageHandler');
const { MessageGenerator } = require('./services/messageGenerator');
const config = require('./config');

// Настройки для бота
const botOptions = {
    telegram: {
        // Увеличим таймауты
        apiRoot: 'https://api.telegram.org',
        timeout: 30000,
        webhookReply: false
    },
    handlerTimeout: 90000
};

const bot = new Telegraf(config.BOT_TOKEN, botOptions);
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

const messageHandler = new MessageHandler(supabase);
const messageGenerator = new MessageGenerator(supabase);

// Хранение состояния ожидания ввода вероятности
let awaitingProbability = false;
let awaitingReactionProbability = false;
let awaitingSwearToggle = false;

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

// Обработчики кнопок
bot.action('set_probability', async (ctx) => {
    try {
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            return ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
        }
        
        awaitingProbability = true;
        await ctx.answerCbQuery();
        await ctx.reply(
            '📊 Введите новую вероятность ответа (от 1 до 100%).\n' +
            'Например: 10 - ответ на 10% сообщений\n' +
            'Текущее значение: ' + config.RESPONSE_PROBABILITY + '%'
        );
    } catch (error) {
        console.error('Ошибка при установке вероятности:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

bot.action('clear_db', async (ctx) => {
    try {
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            return ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
        }
        
        await messageHandler.clearDatabase();
        await ctx.answerCbQuery('База данных очищена');
        await ctx.reply('✅ База данных успешно очищена!');
    } catch (error) {
        console.error('Ошибка при очистке базы данных:', error);
        await ctx.answerCbQuery('Ошибка при очистке базы данных');
    }
});

// Добавляем обработчик для установки вероятности реакций
bot.action('set_reaction_probability', async (ctx) => {
    try {
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            return ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
        }
        
        awaitingReactionProbability = true;
        await ctx.answerCbQuery();
        await ctx.reply(
            '😎 Введите новую вероятность реакций (от 1 до 100%).\n' +
            'Например: 15 - реакция на 15% сообщений\n' +
            'Текущее значение: ' + config.REACTION_PROBABILITY + '%'
        );
    } catch (error) {
        console.error('Ошибка при установке вероятности реакций:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Добавляем новый обработчик для toggle_swears
bot.action('toggle_swears', async (ctx) => {
    try {
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            return ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
        }
        
        // Переключаем состояние
        config.SWEAR_ENABLED = !config.SWEAR_ENABLED;
        
        // Обновляем сообщение с настройками
        const keyboard = ctx.callbackQuery.message.reply_markup;
        // Находим и обновляем кнопку с матами
        keyboard.inline_keyboard[1][0] = {
            text: config.SWEAR_ENABLED ? '🤬 Маты: ВКЛ' : '😇 Маты: ВЫКЛ',
            callback_data: 'toggle_swears'
        };

        await ctx.editMessageText(
            `Текущие настройки Полуумного Гуся:\n` +
            `Вероятность ответа: ${config.RESPONSE_PROBABILITY}%\n` +
            `Вероятность реакции: ${config.REACTION_PROBABILITY}%\n` +
            `Маты: ${config.SWEAR_ENABLED ? 'включены' : 'выключены'}`,
            { reply_markup: keyboard }
        );

        await ctx.answerCbQuery(
            config.SWEAR_ENABLED ? 'Маты включены' : 'Маты выключены'
        );
    } catch (error) {
        console.error('Ошибка при переключении матов:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Добавим обработку ошибок подключения
bot.catch((err, ctx) => {
    console.error('Ошибка Telegraf:', err);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
        console.log('Переподключение к Telegram...');
        bot.telegram.getMe().catch(e => {
            console.error('Ошибка переподключения:', e);
        });
    }
    if (ctx?.from?.username === 'Umbrellla777') {
        ctx.reply('Произошла ошибка в работе бота: ' + err.message).catch(() => {});
    }
});

// Добавим периодическую проверку соединения
setInterval(() => {
    bot.telegram.getMe().catch(err => {
        console.error('Ошибка проверки соединения:', err);
    });
}, 60000); // каждую минуту

// Запуск бота
bot.launch().then(() => {
    console.log('Бот запущен');
    console.log('Текущая вероятность ответа:', config.RESPONSE_PROBABILITY);
}).catch((error) => {
    console.error('Ошибка при запуске бота:', error);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 