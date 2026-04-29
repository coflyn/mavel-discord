const { EmbedBuilder, ActivityType } = require("discord.js");
const config = require("../config");
const fs = require("fs");
const path = require("path");
const { resolveEmoji } = require("./emoji-helper");

async function advanceLog(client, data) {
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

    const colors = {
      error: "#ff4757",
      warning: "#ffa502",
      success: "#2ed573",
      admin: "#1e90ff",
      online: "#2ed573",
      music: "#6c5ce7",
      default: "#6c5ce7",
    };

    const ARROW = resolveEmoji(guild, "arrow", "•");
    const FIRE = resolveEmoji(guild, "purple_fire", "✨");
    const ROCKET = resolveEmoji(guild, "rocket", "🚀");
    const LEA = resolveEmoji(guild, "lea", "👤");
    const PC = resolveEmoji(guild, "pc", "💻");
    const NOTIF = resolveEmoji(guild, "notif", "🔔");
    const CHEST = resolveEmoji(guild, "chest", "📦");
    const ONLINE = resolveEmoji(guild, "online", "⚙️");

    const botUser = client.user;
    const botBanner = botUser.bannerURL
      ? botUser.bannerURL({ dynamic: true, size: 1024 })
      : null;

    const embed = new EmbedBuilder()
      .setColor(colors[data.type] || colors.default)
      .setAuthor({
        name: `MaveL | ${data.type?.toUpperCase() || "REPORT"}`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle(`${FIRE} **${data.title || "Bot Activity Report"}**`)
      .setImage(botBanner)
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

    if (data.platform) {
      embed.addFields({
        name: `${ONLINE} **Platform**`,
        value: `${ARROW} ${data.platform.toUpperCase()}`,
        inline: true,
      });
    }

    if (data.size) {
      embed.addFields({
        name: `${CHEST} **File Size**`,
        value: `\`${data.size}\``,
        inline: true,
      });
    }

    if (data.url) {
      embed.addFields({
        name: `${NOTIF} **Media Link**`,
        value: `[Click to View](${data.url})`,
        inline: false,
      });
    }

    if (data.extra) {
      embed.addFields({
        name: `${NOTIF} **Extra Information**`,
        value: `\`\`\`${data.extra.substring(0, 1024)}\`\`\``,
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
