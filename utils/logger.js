const { EmbedBuilder, ActivityType } = require("discord.js");
const config = require("../config");

async function advanceLog(client, data) {
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

    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "✨");
    const ROCKET = getEmoji("rocket", "🚀");
    const LEA = getEmoji("lea", "👤");
    const ONLINE = getEmoji("online", "⚙️");
    const NOTIF = getEmoji("notif", "🔔");
    const PC = getEmoji("pc", "💻");
    const LOCK = getEmoji("cash", "🔐");

    const botIcon = client.user.displayAvatarURL();
    const embed = new EmbedBuilder()
      .setColor(data.type === "error" ? "#ff4757" : "#6c5ce7")
      .setAuthor({
        name: `MaveL | ${data.type?.toUpperCase() || "ACTIVITY"}`,
        iconURL: botIcon.startsWith("http") ? botIcon : null,
      })
      .setTitle(`${FIRE} **${data.title || "Advance Log Report"}**`)
      .setDescription(
        `### ${ROCKET} **Activity Details**\n` +
          `${ARROW} **Action:** \`${data.activity || "---"}\`\n` +
          `${ARROW} **Note:** *${data.message || "No additional detail."}*`,
      )
      .addFields(
        {
          name: `${LEA} **Action By**`,
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
        text: "MaveL Intelligence System",
        iconURL: botIcon.startsWith("http") ? botIcon : null,
      })
      .setTimestamp();

    if (data.extra) {
      embed.addFields({
        name: `${NOTIF} **Additional Info**`,
        value: `\`\`\`${data.extra}\`\`\``,
        inline: false,
      });
    }

    let content = "";
    if (data.type === "error") {
      try {
        const app = await client.application.fetch();
        const ownerId = app.owner.ownerId || app.owner.id;
        content = `<@${ownerId}>`;
      } catch (e) {
        // Fallback
      }
    }

    await channel.send({ content, embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[ADV-LOG] Error sending log:", err.message);
  }
}

module.exports = { advanceLog };
