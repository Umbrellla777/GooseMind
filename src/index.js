const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { MessageHandler } = require('./handlers/messageHandler');
const { MessageGenerator } = require('./services/messageGenerator');
const config = require('./config');

const bot = new Telegraf(config.BOT_TOKEN);
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

const messageHandler = new MessageHandler(supabase);
const messageGenerator = new MessageGenerator(supabase);

// Хранение состояния ожидания ввода вероятности
let awaitingProbability = false;
let awaitingReactionProbability = false;
let awaitingSwearMultiplier = false;

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
                        { text: '😎 Частота реакций', callback_data: 'set_reaction_probability' },
                        { text: '🤬 Частота матов', callback_data: 'set_swear_multiplier' }
                    ],
                    [
                        { text: '🗑 Очистить память', callback_data: 'clear_db' }
                    ]
                ]
            };

            await ctx.reply(
                `Текущие настройки Полуумного Гуся:\n` +
                `Вероятность ответа: ${config.RESPONSE_PROBABILITY}\n` +
                `Вероятность реакции: ${config.REACTION_PROBABILITY}\n` +
                `Множитель матов: ${config.SWEAR_MULTIPLIER}`,
                { reply_markup: keyboard }
            );
            return;
        }

        // Проверяем, ожидаем ли ввод вероятности ответов
        if (awaitingProbability && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const prob = parseFloat(ctx.message.text);
            if (!isNaN(prob) && prob >= 0.01 && prob <= 1) {
                config.RESPONSE_PROBABILITY = prob;
                await ctx.reply(`✅ Вероятность ответа установлена на ${prob}`);
                awaitingProbability = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 0.01 до 1');
                return;
            }
        }

        // Добавляем проверку для вероятности реакций
        if (awaitingReactionProbability && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const prob = parseFloat(ctx.message.text);
            if (!isNaN(prob) && prob >= 0.01 && prob <= 1) {
                config.REACTION_PROBABILITY = prob;
                await ctx.reply(`✅ Вероятность реакций установлена на ${prob}`);
                awaitingReactionProbability = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 0.01 до 1');
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
        if (Math.random() < config.RESPONSE_PROBABILITY) {
            const response = await messageGenerator.generateResponse(ctx.message);
            await ctx.reply(response);
        }

        // Анализируем сообщение для реакции
        const reactions = await messageHandler.analyzeForReaction(ctx.message);
        if (reactions) {
            try {
                await ctx.telegram.callApi('setMessageReaction', {
                    chat_id: ctx.message.chat.id,
                    message_id: ctx.message.message_id,
                    reaction: reactions.map(emoji => ({
                        type: 'emoji',
                        emoji: emoji
                    })),
                    is_big: Math.random() < 0.1 // 10% шанс на большую реакцию
                });
            } catch (error) {
                // Игнорируем ошибки реакций
            }
        }

        // Добавляем обработку ввода множителя в обработчик сообщений
        if (awaitingSwearMultiplier && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const multiplier = parseInt(ctx.message.text);
            if (!isNaN(multiplier) && multiplier >= 0 && multiplier <= 10) {
                config.SWEAR_MULTIPLIER = multiplier;
                const message = multiplier === 0 
                    ? '✅ Маты отключены' 
                    : `✅ Множитель матов установлен на ${multiplier}`;
                await ctx.reply(message);
                awaitingSwearMultiplier = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 0 до 10');
                return;
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
            '📊 Введите новую вероятность ответа (от 0.01 до 1).\n' +
            'Например: 0.1 - ответ на 10% сообщений\n' +
            'Текущее значение: ' + config.RESPONSE_PROBABILITY
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
            '😎 Введите новую вероятность реакций (от 0.01 до 1).\n' +
            'Например: 0.15 - реакция на 15% сообщений\n' +
            'Текущее значение: ' + config.REACTION_PROBABILITY
        );
    } catch (error) {
        console.error('Ошибка при установке вероятности реакций:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Добавляем обработчик для установки множителя матов
bot.action('set_swear_multiplier', async (ctx) => {
    try {
        if (ctx.from.username.toLowerCase() !== 'umbrellla777') {
            return ctx.answerCbQuery('Только @Umbrellla777 может использовать эти кнопки');
        }
        
        awaitingSwearMultiplier = true;
        await ctx.answerCbQuery();
        await ctx.reply(
            '🤬 Введите новый множитель для матов (от 0 до 10).\n' +
            'Например: 3 - маты будут встречаться в 3 раза чаще\n' +
            '0 - маты отключены\n' +
            'Текущее значение: ' + config.SWEAR_MULTIPLIER
        );
    } catch (error) {
        console.error('Ошибка при установке множителя матов:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка Telegraf:', err);
    if (ctx.from?.username === 'Umbrellla777') {
        ctx.reply('Произошла ошибка в работе бота: ' + err.message);
    }
});

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