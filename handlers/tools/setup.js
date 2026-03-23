const {
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../../config");

const settingsPath = path.join(
  __dirname,
  "..",
  "..",
  "database",
  "settings.json",
);

module.exports = async function setupHandler(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "*Unauthorized. Administrative override required.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const NOTIF =
    interaction.guild.emojis.cache
      .find((e) => e.name === "notif")
      ?.toString() || "🔔";
  const ARROW =
    interaction.guild.emojis.cache
      .find((e) => e.name === "arrow")
      ?.toString() || ">";

  const generateEmbed = () => {
    return new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`${NOTIF} **System Registry Configuration**`)
      .setDescription(
        `*Configure the operational endpoints for MaveL Hub across the server.*`,
      )
      .addFields({
        name: "**Current Endpoints**",
        value:
          `${ARROW} **Download:** <#${config.allowedChannelId || "Not Set"}>\n` +
          `${ARROW} **Logs:** <#${config.logsChannelId || "Not Set"}>\n` +
          `${ARROW} **Music:** <#${config.musicChannelId || "Not Set"}>`,
      })
      .setFooter({ text: "Use selection menus below to redirect endpoints." });
  };

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_download")
        .setPlaceholder("Select Downloader Channel...")
        .addChannelTypes(ChannelType.GuildText),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_logs")
        .setPlaceholder("Select Logs/Admin Channel...")
        .addChannelTypes(ChannelType.GuildText),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_music")
        .setPlaceholder("Select Music Operating Channel...")
        .addChannelTypes(ChannelType.GuildText),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup_done")
        .setLabel("Finalize Configuration")
        .setStyle(ButtonStyle.Success),
    ),
  ];

  const replyOptions = {
    embeds: [generateEmbed()],
    components: rows,
    flags: [MessageFlags.Ephemeral],
    withResponse: true,
  };

  const sent = await interaction.reply(replyOptions);

  const response = sent?.resource || sent;

  if (
    !response ||
    typeof response.createMessageComponentCollector !== "function"
  ) {
    console.warn("[SETUP] Failed to get response object for collector.");
    return;
  }

  const collector = response.createMessageComponentCollector({
    time: 300000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "setup_done") {
      await i
        .update({
          content: "*Configuration finalized. System synchronized.*",
          components: [],
          embeds: [generateEmbed()],
        })
        .catch(() => {});
      return collector.stop();
    }

    const channelId = i.values[0];
    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
      : {};

    if (i.customId === "setup_download") {
      settings.downloadChannelId = channelId;
      config.allowedChannelId = channelId;
    } else if (i.customId === "setup_logs") {
      settings.logsChannelId = channelId;
      config.logsChannelId = channelId;
    } else if (i.customId === "setup_music") {
      settings.musicChannelId = channelId;
      config.musicChannelId = channelId;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    await i
      .update({
        embeds: [generateEmbed()],
        components: rows,
      })
      .catch(() => {});
  });
};
