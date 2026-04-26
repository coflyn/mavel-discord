const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "app_report",
  async execute(interaction) {
    const msg = interaction.targetMessage;

    let logsChannelId = null;
    try {
      const dbPath = path.join(__dirname, "../../database/settings.json");
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath));
        logsChannelId = db.logsChannelId;
      }
    } catch {}

    if (!logsChannelId) {
      return interaction.reply({
        content: "*Error: Server logs channel is not configured.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const logChannel = interaction.guild.channels.cache.get(logsChannelId);
    if (!logChannel) {
      return interaction.reply({
        content: "*Error: Configured logs channel is missing or inaccessible.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const NOTIF = resolveEmoji(interaction.guild, "notif", "🚨");

      const embed = new EmbedBuilder()
        .setColor("#e74c3c")
        .setTitle(`${NOTIF} User Report: Flagged Message`)
        .addFields(
          {
            name: "Reported By",
            value: `${interaction.user} (\`${interaction.user.id}\`)`,
            inline: true,
          },
          {
            name: "Message Author",
            value: `${msg.author} (\`${msg.author.id}\`)`,
            inline: true,
          },
          {
            name: "Channel",
            value: `${interaction.channel} | [Jump to Message](${msg.url})`,
            inline: false,
          },
          {
            name: "Content",
            value: msg.content
              ? `\`\`\`\n${msg.content.substring(0, 1000)}\n\`\`\``
              : "*[No Text Content]*",
            inline: false,
          },
        )
        .setTimestamp();

      if (msg.attachments.size > 0) {
        embed.addFields({
          name: "Attachments",
          value: msg.attachments.map((a) => `[${a.name}](${a.url})`).join("\n"),
        });
      }

      await logChannel.send({ embeds: [embed] });
      await interaction.editReply({
        content: `*Message successfully flagged and reported to admins.*`,
      });
    } catch (e) {
      await interaction.editReply({
        content: `*Failed to send report. Please check channel permissions.*`,
      });
    }
  },
};
