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

            const message = `
📊 *Настройки кармы*

Текущая карма: ${karma}
Характер: ${characterType.name}
Особенности: ${characterType.traits.join(', ')}`;

            await ctx.replyWithMarkdown(message);

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
        // Команда для открытия настроек кармы
        bot.command('karma', async (ctx) => {
            await this.showSettings(ctx);
        });
    }
}

module.exports = { SettingsHandler }; 