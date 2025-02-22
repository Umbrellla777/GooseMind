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
let awaitingSwearProbability = false;

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

// Добавляем функцию handleCallback перед регистрацией обработчиков
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
                awaitingSwearProbability = true;
                await ctx.answerCbQuery('Введите вероятность матов');
                await ctx.reply(
                    '🤬 Введите вероятность использования матов (от 0 до 100%).\n' +
                    'Например: 50 - маты будут в 50% ответов\n' +
                    '0 - маты отключены\n' +
                    'Текущее значение: ' + config.SWEAR_PROBABILITY + '%'
                );
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
        console.error('Ошибка обработки callback:', error);
        try {
            await ctx.answerCbQuery('Произошла ошибка').catch(() => {});
            await ctx.reply('Произошла ошибка: ' + error.message).catch(() => {});
        } catch (e) {
            console.error('Ошибка отправки уведомления об ошибке:', e);
        }
    }
}

// Массив саркастических ответов на реакцию 💩
const POOP_REACTION_RESPONSES = [
    "@user, твоя «какаха» — это, наверное, самый яркий след, который ты оставишь в истории этого чата.",
    "@user, я понимаю, что у тебя своеобразное чувство юмора, но, может, в следующий раз попробуешь что-то более оригинальное?",
    "@user, я ценю твое стремление выразить свое мнение, но, может, в следующий раз обойдемся без таких... реакций?",
    "@user, твоя «какаха» — это как напоминание о том, что не все люди обладают хорошим вкусом.",
    "@user, твоя «какаха» — это как попытка выразить глубокую мысль, но, к сожалению, не очень удачная.",
    "@user, я вижу, что ты очень старался, но, может, в следующий раз попробуешь что-то менее... банальное?",
    "@user, твоя «какаха» — это как комментарий из разряда «я тоже здесь был».",
    "@user, я понимаю, что у каждого свой способ выразить себя, но, может, твой способ немного... специфичен?",
    "@user, твоя «какаха» — это как напоминание о том, что не все комментарии одинаково полезны.",
    "@user, я смотрю, что ты очень сильно хочешь чтобы тебя заметили, но может стоит попробовать что-нибудь более конструктивное?",
    "@user, твоя «какаха» это как плевок в вечность, который никто не заметит.",
    "@user, твоя «какаха» это как твой уровень интеллекта.",
    "@user, твоя «какаха» это как попытка выразить себя, но получилось как всегда."
];

// Обработчик реакций ПЕРВЫМ после создания бота
bot.on('message_reaction', async (ctx) => {
    try {
        console.log('=== ПОЛУЧЕНА РЕАКЦИЯ ===');
        console.log('Контекст:', JSON.stringify(ctx.update, null, 2));

        const reaction = ctx.update.message_reaction;
        if (!reaction) return;

        // Проверяем, что это реакция 💩 на сообщение бота
        const isPoopReaction = reaction.new_reaction?.some(r => r.emoji === '💩');
        const isBotMessage = reaction.message?.from?.id === ctx.botInfo.id;

        console.log('Проверка реакции:', {
            isPoopReaction,
            isBotMessage,
            messageFromId: reaction.message?.from?.id,
            botId: ctx.botInfo.id
        });

        if (isPoopReaction && isBotMessage) {
            const username = reaction.user?.username;
            if (username) {
                const response = POOP_REACTION_RESPONSES[
                    Math.floor(Math.random() * POOP_REACTION_RESPONSES.length)
                ].replace('@user', '@' + username);

                console.log('Отправляем ответ:', response);
                await ctx.reply(response);
            }
        }
    } catch (error) {
        console.error('Ошибка обработки реакции:', error);
    }
});

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
                        { text: '🤬 Частота матов', callback_data: 'toggle_swears' }
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
                `Вероятность матов: ${config.SWEAR_PROBABILITY}%`,
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

        // Проверяем ввод вероятности матов
        if (awaitingSwearProbability && ctx.message.from.username.toLowerCase() === 'umbrellla777') {
            const prob = parseInt(ctx.message.text);
            if (!isNaN(prob) && prob >= 0 && prob <= 100) {
                config.SWEAR_PROBABILITY = prob;
                await ctx.reply(`✅ Вероятность матов установлена на ${prob}%`);
                awaitingSwearProbability = false;
                return;
            } else {
                await ctx.reply('❌ Пожалуйста, введите число от 0 до 100');
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
            
            // Отправляем "печатает" перед генерацией текста
            await ctx.telegram.sendChatAction(ctx.message.chat.id, 'typing');
            
            const response = await messageGenerator.generateResponse(ctx.message);
            
            // Если ответ не пустой и не заглушка - отправляем
            if (response && response !== "Гусь молчит...") {
                await ctx.reply(response);
            } else {
                console.log('Пустой ответ от генератора');
            }
        } else {
            // Проверяем на реакцию
            if (Math.random() * 100 < config.REACTION_PROBABILITY) {
                const reactions = await messageHandler.analyzeForReaction(ctx.message);
                if (reactions && reactions.length > 0) {
                    try {
                        await ctx.telegram.callApi('setMessageReaction', {
                            chat_id: ctx.message.chat.id,
                            message_id: ctx.message.message_id,
                            reaction: reactions.map(emoji => ({
                                type: 'emoji',
                                emoji: emoji
                            })),
                            is_big: Math.random() < 0.2
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
bot.action('set_probability', ctx => handleCallback(ctx, 'set_probability'));
bot.action('set_reaction_probability', ctx => handleCallback(ctx, 'set_reaction_probability'));
bot.action('toggle_swears', ctx => handleCallback(ctx, 'toggle_swears'));
bot.action('clear_db', ctx => handleCallback(ctx, 'clear_db'));

// И добавим обработку ошибок
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
        // Удаляем вебхук и старые обновления
        await bot.telegram.deleteWebhook({ 
            drop_pending_updates: true 
        });

        // Явно указываем все типы обновлений
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: [
                'message',
                'edited_message',
                'callback_query',
                'message_reaction',
                'message_reaction_count'
            ]
        });

        console.log('Бот запущен и слушает реакции');
    } catch (error) {
        console.error('Ошибка запуска:', error);
        isConnected = false;
        setTimeout(startBot, reconnectInterval * 2);
    }
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    bot.stop('SIGTERM');
});

// Запускаем бота
startBot();