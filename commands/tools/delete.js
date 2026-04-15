const { MessageFlags, PermissionFlagsBits, ChannelType } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = {
  name: "delete",
  async execute(interaction, client) {
    const guild = interaction.guild;
    const FIRE = resolveEmoji(guild, "purple_fire", "🔥");
    const RED_DOT = resolveEmoji(guild, "ping_red", "🔴");

    await interaction.deferReply({ flags: [64] });
    const count = interaction.options.getInteger("count") || 5;
    const limit = Math.min(count, 100);

    if (!guild) {
      try {
        const messages = await interaction.channel.messages.fetch({
          limit: 100,
        });
        const botMessages = messages.filter(
          (m) => m.author.id === client.user.id,
        );
        const toDelete = Array.from(botMessages.values()).slice(0, limit);

        let deleted = 0;
        for (const msg of toDelete) {
          await msg.delete().catch(() => {});
          deleted++;
        }

        const res = await interaction.editReply({
          content: `### ${FIRE} **DM Cleanup Finished**\n*Identified and removed **${deleted}** bot messages from this conversation.*`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
        return res;
      } catch (err) {
        return await interaction.editReply({
          content: `### ${RED_DOT} **Cleanup Failed**\n*Error: ${err.message}*`,
        });
      }
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.editReply({
          content: `*Error: Permission Denied. You need 'Manage Messages' permission to use this.*`,
        });
      }

      try {
        const deletedMessages = await interaction.channel.bulkDelete(limit, true);
        const res = await interaction.editReply({
          content: `### ${FIRE} **Cleanup Finished**\n*Removed **${deletedMessages.size}** messages from this channel.*`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
        return res;
      } catch (err) {
        return await interaction.editReply({
          content: `### ${RED_DOT} **Cleanup Failed**\n*Error: ${err.message}*`,
        });
      }
    }
  },
};
