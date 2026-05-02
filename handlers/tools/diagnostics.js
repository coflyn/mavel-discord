const {
  EmbedBuilder,
  MessageFlags,
  version: djsVersion,
} = require("discord.js");
const os = require("os");
const process = require("process");
const http = require("../../utils/http");
const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");
const { formatUptime } = require("../downloader/core-helpers");

module.exports = async function diagnosticsHandler(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    await interaction.reply({
      content: "*Error: Only administrators can view system diagnostics.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  if (interaction.deferReply) {
    await interaction
      .deferReply({ flags: [MessageFlags.Ephemeral] })
      .catch((e) => console.error("[DIAG-DEFER]", e.message));
  }

  const guild = interaction.guild || interaction.client.guilds.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("lea", "🛰️");
  const PC = getEmoji("pc", "💻");
  const CAMERA = getEmoji("camera", "🛰️");
  const DIAMOND = getEmoji("diamond", "✨");
  const ROCKET = getEmoji("rocket", "🚀");
  const FIRE = getEmoji("purple_fire", "🔥");

  const ping = Math.round(interaction.client.ws.ping);

  let ipInfo = { query: "Unknown", country: "Secret", isp: "Cloud" };
  try {
    const res = await http.get("http://ip-api.com/json/", { timeout: 5000 });
    if (res.data && res.data.status === "success") {
      ipInfo = res.data;
    }
  } catch (e) {
    console.error("[HEALTH-IP] Error:", e.message);
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const uptimeStr = formatUptime(uptimeSeconds);

  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
  const totalMemory = os.totalmem() / 1024 / 1024 / 1024;

  const platform = os.platform();
  const nodeVersion = process.version;

  const embed = new EmbedBuilder()
    .setColor(colors.ADMIN)
    .setAuthor({
      name: "MaveL Health Status",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTitle(`${AMOGUS} **System Health Report**`)
    .setDescription(`*Checking on my health, location and performance.*`)
    .addFields(
      {
        name: `${FIRE} **System Status**`,
        value:
          `${ARROW} **IP Address:** \`${ipInfo.query}\`\n` +
          `${ARROW} **Country:** \`${ipInfo.country}\`\n` +
          `${ARROW} **ISP:** \`${ipInfo.isp}\``,
        inline: false,
      },
      {
        name: `${ROCKET} **Performance**`,
        value:
          `${ARROW} **Latency:** \`${ping}ms\`\n` +
          `${ARROW} **Uptime:** \`${uptimeStr}\``,
        inline: false,
      },
      {
        name: `${DIAMOND} **Resource Usage**`,
        value:
          `${ARROW} \`${memoryUsage.toFixed(2)} MB\` *Used*\n` +
          `${ARROW} \`${totalMemory.toFixed(1)} GB\` *Capacity*`,
        inline: false,
      },
      {
        name: `${PC} **Technical Info**`,
        value:
          `${ARROW} \`${platform.toUpperCase()}\` *OS*\n` +
          `${ARROW} \`${nodeVersion}\` *Node.js*\n` +
          `${ARROW} \`v${djsVersion}\` *Discord.js*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Privacy",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  await (interaction.deferred
    ? interaction.editReply({ embeds: [embed] })
    : interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      }));

  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 60000);
};
