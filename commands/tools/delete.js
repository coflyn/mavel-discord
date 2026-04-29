const {
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  slashData: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Purge bot messages in DMs or Clean chat messages in Servers")
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("Number of messages (max 1000)")
        .setRequired(true)
    ),
  name: "delete",
  async execute(interaction, client) {
    const guild = interaction.guild;
    const FIRE = resolveEmoji(guild, "purple_fire", "🔥");
    const RED_DOT = resolveEmoji(guild, "ping_red", "🔴");

    await interaction.deferReply({ flags: [64] });
    const count = interaction.options.getInteger("count") || 5;
    const limit = Math.min(count, 1000);

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

        await interaction.editReply({
          content: `### ${FIRE} **DM Cleanup Finished**\n*Identified and removed **${deleted}** bot messages from this conversation.*`,
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
      } catch (err) {
        await interaction.editReply({
          content: `### ${RED_DOT} **Cleanup Failed**\n*Error: ${err.message}*`,
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }
    } else {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        await interaction.editReply({
          content: `*Error: Permission Denied. You need 'Manage Messages' permission.*`,
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }

      try {
        let remaining = limit;
        let totalDeleted = 0;
        let oldMessagesCount = 0;

        while (remaining > 0) {
          const batchSize = Math.min(remaining, 100);
          const fetched = await interaction.channel.messages.fetch({
            limit: batchSize,
          });
          if (fetched.size === 0) break;

          const now = Date.now();
          const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

          const youngMessages = fetched.filter(
            (m) => m.createdTimestamp > twoWeeksAgo,
          );
          const oldMessages = fetched.filter(
            (m) => m.createdTimestamp <= twoWeeksAgo,
          );

          if (youngMessages.size > 0) {
            const deleted = await interaction.channel.bulkDelete(
              youngMessages,
              true,
            );
            totalDeleted += deleted.size;
          }

          if (oldMessages.size > 0) {
            for (const msg of oldMessages.values()) {
              await msg.delete().catch(() => {});
              totalDeleted++;
              oldMessagesCount++;
            }
          }

          remaining -= fetched.size;
          if (fetched.size < batchSize) break;

          if (remaining > 0) await new Promise((r) => setTimeout(r, 1000));
        }

        const res = await interaction.editReply({
          content: `### ${FIRE} **Cleanup Finished**\n*Removed **${totalDeleted}** messages from this channel.*${oldMessagesCount > 0 ? `\n> *Note: **${oldMessagesCount}** messages were older than 14 days and deleted manually.*` : ""}`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
        return res;
      } catch (err) {
        await interaction.editReply({
          content: `### ${RED_DOT} **Cleanup Failed**\n*Error: ${err.message}*`,
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }
    }
  },
};
