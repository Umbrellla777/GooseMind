const { Markup } = require('telegraf');
const config = require('../config');
const { KarmaService } = require('../services/karmaService');

class SettingsHandler {
    constructor(supabase) {
        this.supabase = supabase;
        this.karmaService = new KarmaService(supabase);
    }

    async showSettings(ctx) {
        try {
            const chatId = ctx.chat.id;
            const karma = await this.karmaService.getKarma(chatId);
            const characterType = this.karmaService.getCharacterType(karma);

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('➕ Повысить карму', 'karma_up'),
                    Markup.button.callback('➖ Понизить карму', 'karma_down')
                ],
                [
                    Markup.button.callback('🔄 Сбросить карму', 'karma_reset')
                ],
                [
                    Markup.button.callback('⬅️ Назад', 'back_to_settings')
                ]
            ]);

            const message = `
📊 *Настройки кармы*

Текущая карма: ${karma}
Характер: ${characterType.name}
Особенности: ${characterType.traits.join(', ')}

_Используйте кнопки ниже для управления кармой_`;

            await ctx.replyWithMarkdown(message, keyboard);

        } catch (error) {
            console.error('Error showing karma settings:', error);
            await ctx.reply('Ошибка при отображении настроек кармы');
        }
    }

    async handleKarmaChange(ctx, change) {
        try {
            const chatId = ctx.chat.id;
            const result = await this.karmaService.updateKarma(chatId, change);

            if (result.levelChanged) {
                await ctx.reply(`
🔄 *Уровень кармы изменился!*
Новый уровень: ${result.newLevel.name}
Особенности: ${result.newLevel.traits.join(', ')}`, 
                    { parse_mode: 'Markdown' });
            }

            // Обновляем сообщение с настройками
            await this.showSettings(ctx);

        } catch (error) {
            console.error('Error handling karma change:', error);
            await ctx.reply('Ошибка при изменении кармы');
        }
    }

    setupHandlers(bot) {
        // Обработчики кнопок
        bot.action('karma_up', async (ctx) => {
            await this.handleKarmaChange(ctx, config.KARMA_ACTIONS.POSITIVE.KIND_WORD);
        });

        bot.action('karma_down', async (ctx) => {
            await this.handleKarmaChange(ctx, config.KARMA_ACTIONS.NEGATIVE.RUDE);
        });

        bot.action('karma_reset', async (ctx) => {
            const chatId = ctx.chat.id;
            await this.karmaService.updateKarma(chatId, -await this.karmaService.getKarma(chatId));
            await this.showSettings(ctx);
        });

        bot.action('back_to_settings', async (ctx) => {
            // Возврат к основным настройкам
            // Здесь нужно вызвать ваш основной метод показа настроек
        });

        // Команда для открытия настроек кармы
        bot.command('karma', async (ctx) => {
            await this.showSettings(ctx);
        });
    }
}

module.exports = { SettingsHandler }; 