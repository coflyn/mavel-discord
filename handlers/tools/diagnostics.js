const {
  EmbedBuilder,
  MessageFlags,
  version: djsVersion,
} = require("discord.js");
const os = require("os");
const process = require("process");

module.exports = async function diagnosticsHandler(interaction) {
  if (interaction.deferReply) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(e => console.error("[DIAG-DEFER]", e.message));
  }

  const guildEmojis = await interaction.guild.emojis.fetch().catch(() => null);
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("amogus", "🛰️");
  const PC = getEmoji("pc", "💻");
  const CAMERA = getEmoji("camera", "🛰️");
  const DIAMOND = getEmoji("diamond", "✨");
  const ROCKET = getEmoji("rocket", "🚀");

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
  const totalMemory = os.totalmem() / 1024 / 1024 / 1024;

  const platform = os.platform();
  const cpuModel = os.cpus()[0].model;
  const nodeVersion = process.version;

  const embed = new EmbedBuilder()
    .setColor("#d63031")
    .setAuthor({
      name: "MaveL System Diagnostics",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTitle(`${AMOGUS} **Pulse Analysis Report**`)
    .setDescription(`*Real-time heartbeat monitor for the MaveL core engine.*`)
    .addFields(
      {
        name: `${ROCKET} **Operation Uptime**`,
        value: `${ARROW} \`${uptimeStr}\``,
        inline: false,
      },
      {
        name: `${DIAMOND} **Engine Vitality**`,
        value: `${ARROW} \`${memoryUsage.toFixed(2)} MB\` *Usage*\n${ARROW} \`${totalMemory.toFixed(1)} GB\` *Capacity*`,
        inline: false,
      },
      {
        name: `${PC} **Architecture**`,
        value: `${ARROW} \`${platform.toUpperCase()}\` *OS*\n${ARROW} \`${nodeVersion}\` *Node*\n${ARROW} \`v${djsVersion}\` *D.js*`,
        inline: false,
      },
      {
        name: `${CAMERA} **Targeting System**`,
        value: `${ARROW} \`${interaction.client.guilds.cache.size}\` *Active Bases*\n${ARROW} \`${interaction.client.users.cache.size}\` *Identified Personnel*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Diagnostics Hub",
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
