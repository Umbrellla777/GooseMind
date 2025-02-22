const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { MessageHandler } = require('./handlers/messageHandler');
const { MessageGenerator } = require('./services/messageGenerator');
const config = require('./config');

// Настройки для бота
const botOptions = {
    telegram: {
        apiRoot: 'https://api.telegram.org',
        apiTimeout: 30000,
        webhookReply: false
    },
    handlerTimeout: 30000
};

const bot = new Telegraf(config.BOT_TOKEN, botOptions);
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
const messageHandler = new MessageHandler(supabase);
const messageGenerator = new MessageGenerator(supabase);

// Хранилище сообщений бота
const botMessages = new Map();
const MESSAGE_LIMIT = 100;
const MESSAGE_TTL = 24 * 60 * 60 * 1000;

// Кэш для ответов на реакции
const POOP_REACTION_RESPONSES = [

    "@user, твоя «какаха» — это, наверное, самый яркий след, который ты оставишь в истории этого чата.",
    "@user, я понимаю, что у каждого свой способ выразить себя, но, может, твой способ немного... специфичен?",
    "@user, твоя какаха это как попытка выразить себя, но получилось как всегда.",
    "@user, я ценю твой вклад в удобрение чата!",
    "@user, твоя какаха будет храниться в музее современного искусства, как пример... кхм... самовыражения.",
    "@user, спасибо за какаху, но я предпочитаю более традиционные формы общения.",
    "@user, твоя какаха будет бережно храниться в моей коллекции неординарных реакций.",
    "@user, спасибо за какаху, но может попробуем использовать слова?",
    "@user, я вижу, ты настоящий ценитель каках!",
    "@user, твоя «какаха» — это как напоминание о том, что не все люди обладают хорошим вкусом.",
    "@user, твоя «какаха» — это как попытка выразить глубокую мысль, но, к сожалению, не очень удачная.",
    "@user, я вижу, что ты очень старался, но, может, в следующий раз попробуешь что-то менее... банальное?",
    "@user, твоя «какаха» — это как комментарий из разряда «я тоже здесь был».",
    "@user, твоя «какаха» — это как напоминание о том, что не все комментарии одинаково полезны.",
    "@user, я смотрю, что ты очень сильно хочешь чтобы тебя заметили, но может стоит попробовать что-нибудь более конструктивное?",
    "@user, твоя «какаха» это как плевок в вечность, который никто не заметит.",
    "@user, твоя «какаха» это как твой уровень интеллекта."
];

// Оптимизированная очистка старых сообщений
function cleanupOldMessages() {
    const now = Date.now();
    const threshold = now - MESSAGE_TTL;
    for (const [key, timestamp] of botMessages) {
        if (timestamp < threshold) botMessages.delete(key);
    }
}

// Обработчик реакций
bot.on('message_reaction', async (ctx) => {
    const reaction = ctx.update.message_reaction;
    if (!reaction?.new_reaction?.some(r => r.emoji === '💩')) return;

    const messageKey = `${reaction.chat.id}:${reaction.message_id}`;
    if (!botMessages.has(messageKey)) return;

    const username = reaction.user?.username;
    if (!username) return;

    const response = POOP_REACTION_RESPONSES[
        Math.floor(Math.random() * POOP_REACTION_RESPONSES.length)
    ].replace('@user', '@' + username);

    try {
        const sentMessage = await ctx.reply(response);
        botMessages.set(`${ctx.chat.id}:${sentMessage.message_id}`, Date.now());
        
        if (botMessages.size > MESSAGE_LIMIT) {
            const [oldestKey] = botMessages.keys();
            botMessages.delete(oldestKey);
        }
    } catch (error) {
        console.error('Ошибка отправки ответа на реакцию:', error);
    }
});

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
    try {
        // Пропускаем сообщения от ботов
        if (ctx.message.from.is_bot) return;

        // Быстрая проверка на упоминание бота
        const shouldRespond = ctx.message.text.toLowerCase().includes('гусь') || 
                            Math.random() * 100 < config.RESPONSE_PROBABILITY;
        
        if (!shouldRespond) return;

        // Сохраняем сообщение асинхронно
        messageHandler.saveMessage(ctx.message).catch(console.error);

        // Генерируем ответ
        const response = await messageGenerator.generateResponse(ctx.message);
        if (!response || response === "Гусь молчит...") return;

        // Отправляем ответ и сохраняем ID
        const sentMessage = await ctx.reply(response);
        botMessages.set(`${ctx.chat.id}:${sentMessage.message_id}`, Date.now());

        // Очищаем старые сообщения раз в 100 сообщений
        if (botMessages.size % 100 === 0) cleanupOldMessages();

        // Удаляем самое старое сообщение при превышении лимита
        if (botMessages.size > MESSAGE_LIMIT) {
            const [oldestKey] = botMessages.keys();
            botMessages.delete(oldestKey);
        }
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
    }
});

// Запуск бота
async function startBot() {
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'message_reaction']
        });
        console.log('Бот запущен');
    } catch (error) {
        console.error('Ошибка запуска:', error);
        setTimeout(startBot, 5000);
    }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

startBot();