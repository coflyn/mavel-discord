const { EmbedBuilder, ActivityType } = require("discord.js");
const config = require("../config");
const fs = require("fs");
const path = require("path");

async function advanceLog(client, data) {
  // 1. Always Write to Local File (Backup)
  const logPath = path.join(__dirname, "../bot.log");
  const timestamp = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar",
  });
  const logEntry = `[${timestamp}] [${data.type?.toUpperCase() || "INFO"}] ${data.title}: ${data.message} (User: ${data.user || "System"})\n`;

  try {
    fs.appendFileSync(logPath, logEntry);
  } catch (err) {
    console.error("[LOCAL-LOG-FAIL]", err.message);
  }

  if (!config.logsChannelId) return;

  try {
    const channel = await client.channels
      .fetch(config.logsChannelId)
      .catch(() => null);
    if (!channel) return;

    const guild = client.guilds.cache.first();
    const guildEmojis = guild
      ? (await client.getGuildEmojis?.(guild.id)) ||
        (await guild.emojis.fetch().catch(() => null))
      : null;

    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis?.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    // Color Mapping
    const colors = {
      error: "#ff4757",
      warning: "#ffa502",
      success: "#2ed573",
      admin: "#1e90ff",
      online: "#2ed573",
      default: "#6c5ce7",
    };

    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "✨");
    const ROCKET = getEmoji("rocket", "🚀");
    const LEA = getEmoji("lea", "👤");
    const PC = getEmoji("pc", "💻");
    const NOTIF = getEmoji("notif", "🔔");

    const embed = new EmbedBuilder()
      .setColor(colors[data.type] || colors.default)
      .setAuthor({
        name: `MaveL | ${data.type?.toUpperCase() || "REPORT"}`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle(`${FIRE} **${data.title || "Bot Activity Report"}**`)
      .setDescription(
        `### ${ROCKET} **Task Details**\n` +
          `${ARROW} **Action:** \`${data.activity || "---"}\`\n` +
          `${ARROW} **Message:** *${data.message || "No extra details available."}*`,
      )
      .addFields(
        {
          name: `${LEA} **Performed By**`,
          value: `${ARROW} ${data.user || "System"}`,
          inline: true,
        },
        {
          name: `${PC} **Location**`,
          value: `${ARROW} ${data.guild || "Direct Message"}`,
          inline: true,
        },
      )
      .setFooter({
        text: "MaveL Security System",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    if (data.extra) {
      embed.addFields({
        name: `${NOTIF} **Extra Information**`,
        value: `\`\`\`${data.extra.substring(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    let content = "";
    if (data.type === "error") {
      try {
        const app = await client.application.fetch();
        const owner = app.owner.ownerId ? app.owner.owner : app.owner;
        if (owner) content = `<@${owner.id}>`;
      } catch (e) {}
    }

    await channel.send({ content, embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[ADV-LOG] Error sending log:", err.message);
  }
}

module.exports = { advanceLog };
