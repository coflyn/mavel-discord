const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const fs = require("fs");
const path = require("path");
const config = require("../../config");

const reportCooldowns = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [userId, lastTime] of reportCooldowns.entries()) {
    if (now - lastTime > COOLDOWN_TIME) {
      reportCooldowns.delete(userId);
    }
  }
}, 1800000);

module.exports = async function modalHandler(interaction) {
  const { customId, guild, user, client } = interaction;

  if (customId.startsWith("report_msg_") || customId === "report_bug") {
    const lastReport = reportCooldowns.get(user.id);
    const now = Date.now();

    if (lastReport && now - lastReport < COOLDOWN_TIME) {
      const remaining = Math.ceil((COOLDOWN_TIME - (now - lastReport)) / 1000);
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;

      await interaction.reply({
        content: `*You are sending reports too fast. Please wait ${m}m ${s}s.*`,
        flags: [MessageFlags.Ephemeral],
      });
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }

    reportCooldowns.set(user.id, now);
  }

  const targetChannelId = config.reportsChannelId || config.logsChannelId;

  if (!targetChannelId) {
    await interaction.reply({
      content: "*Error: Reports or Logs channel is not configured.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  const logChannel = guild.channels.cache.get(targetChannelId);
  if (!logChannel) {
    await interaction.reply({
      content: "*Error: Target reports channel is missing or inaccessible.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  const NOTIF = resolveEmoji(guild, "notif", "🚨");

  if (customId.startsWith("report_msg_")) {
    const msgId = customId.replace("report_msg_", "");
    const reason = interaction.fields.getTextInputValue("reason");

    try {
      const channel = interaction.channel;
      const msg = await channel.messages.fetch(msgId).catch(() => null);

      if (!msg) {
        await interaction.reply({
          content: "*Error: Could find the reported message.*",
          flags: [MessageFlags.Ephemeral],
        });
        return setTimeout(
          () => interaction.deleteReply().catch(() => {}),
          10000,
        );
      }

      let contentSummary = msg.content;
      if (!contentSummary) {
        if (msg.embeds.length > 0) {
          const e = msg.embeds[0];
          contentSummary =
            `[Embed] ${e.title || ""}\n${e.description || ""}`.trim();
        }
        if (!contentSummary && msg.attachments.size > 0) {
          contentSummary = `[Media/File] ${msg.attachments.size} attachment(s)`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#e74c3c")
        .setTitle(`${NOTIF} User Report: Flagged Message`)
        .addFields(
          {
            name: "Reported By",
            value: `${user} (\`${user.id}\`)`,
            inline: true,
          },
          {
            name: "Message Author",
            value: `${msg.author} (\`${msg.author.id}\`)`,
            inline: true,
          },
          {
            name: "Reason",
            value: `\`\`\`\n${reason}\n\`\`\``,
            inline: false,
          },
          {
            name: "Location",
            value: `${channel} | [Jump to Message](${msg.url})`,
            inline: false,
          },
          {
            name: "Content",
            value: contentSummary
              ? `\`\`\`\n${contentSummary.substring(0, 1000)}\n\`\`\``
              : "*[No Content]*",
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
      await interaction.reply({
        content: `*Message successfully flagged and reported to admins.*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    } catch (e) {
      console.error("[MODAL-REPORT-MSG] Error:", e);
      await interaction.reply({
        content: `*Failed to process report: ${e.message}*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }
  }

  if (customId === "report_bug") {
    const title = interaction.fields.getTextInputValue("title");
    const description = interaction.fields.getTextInputValue("description");

    try {
      const embed = new EmbedBuilder()
        .setColor("#f1c40f")
        .setTitle(`${NOTIF} Bug Report / Feedback`)
        .addFields(
          {
            name: "Reporter",
            value: `${user} (\`${user.id}\`)`,
            inline: true,
          },
          {
            name: "Guild",
            value: `${guild.name} (\`${guild.id}\`)`,
            inline: true,
          },
          {
            name: "Subject",
            value: `\`${title}\``,
            inline: false,
          },
          {
            name: "Description",
            value: `\`\`\`\n${description}\n\`\`\``,
            inline: false,
          },
        )
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
      await interaction.reply({
        content: `*Bug report successfully sent. Thank you for your feedback!*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    } catch (e) {
      console.error("[MODAL-REPORT-BUG] Error:", e);
      await interaction.reply({
        content: `*Failed to send bug report: ${e.message}*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }
  }
};
