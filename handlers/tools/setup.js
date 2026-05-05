const {
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const path = require("path");
const colors = require("../../utils/embed-colors");
const fs = require("fs");
const config = require("../../config");
const { resolveEmoji } = require("../../utils/emoji-helper");

const settingsPath = path.join(__dirname, "..", "..", "database", "settings.json");

module.exports = async function setupHandler(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "*You don't have permission to use this command.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  const NOTIF = resolveEmoji(interaction, "notif", "🔔");
  const ARROW = resolveEmoji(interaction, "arrow", "•");
  const FIRE = resolveEmoji(interaction, "purple_fire", "🔥");
  const CHANNEL = resolveEmoji(interaction, "pc", "💾");
  const LOGS = resolveEmoji(interaction, "book", "📜");
  const MUSIC = resolveEmoji(interaction, "notif", "🎵");
  const TEMPLE = resolveEmoji(interaction, "megaphone", "🏛️");
  const ADMIN = resolveEmoji(interaction, "diamond", "🛡️");
  const CHECK = resolveEmoji(interaction, "ping_green", "✅");
  const LEA = resolveEmoji(interaction, "lea", "👤");

  let currentCategory = "download";

  const generateEmbed = () => {
    const catNames = {
      download: "Downloader",
      logs: "General Logs",
      music: "Music Control",
      private: "Private Admin",
    };


    return new EmbedBuilder()
      .setColor(colors.CORE)
      .setTitle(`${NOTIF} **MaveL Server Setup**`)
      .setDescription(`${ARROW} *Current Category:* **${catNames[currentCategory]}**`)
      .addFields({
        name: "**Current Settings**",
        value:
          `${ARROW} **Download:** <#${config.allowedChannelId || "Not Set"}>\n` +
          `${ARROW} **Logs:** <#${config.logsChannelId || "Not Set"}>\n` +
          `${ARROW} **Music:** <#${config.musicChannelId || "Not Set"}>\n` +
          `${ARROW} **Private Admin:** <#${config.adminChannelId || "Not Set"}>`,
      })
      .setFooter({ text: "1. Pick Category -> 2. Select Channel/Role -> 3. Finish" });
  };

  const generateRows = () => {
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("setup_category")
          .setPlaceholder("Step 1: Pick Category to Configure...")
          .addOptions([
            { label: "Downloader Channel", value: "download", emoji: CHANNEL, default: currentCategory === "download" },
            { label: "General Logs Channel", value: "logs", emoji: LOGS, default: currentCategory === "logs" },
            { label: "Music Control Channel", value: "music", emoji: MUSIC, default: currentCategory === "music" },
            { label: "Private Admin Channel", value: "private", emoji: ADMIN, default: currentCategory === "private" },
          ])
      )
    ];

    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("setup_channel")
          .setPlaceholder(`Step 2: Select Channel...`)
          .addChannelTypes(ChannelType.GuildText)
      )
    );

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("setup_done")
          .setLabel("Finish & Save Setup")
          .setStyle(ButtonStyle.Success)
          .setEmoji(CHECK)
      )
    );

    return rows;
  };

  await interaction.reply({
    embeds: [generateEmbed()],
    components: generateRows(),
    flags: [MessageFlags.Ephemeral],
    withResponse: true,
  });

  const response = await interaction.fetchReply().catch(() => null);
  if (!response) return;

  const collector = response.createMessageComponentCollector({ time: 600000 });

  collector.on("collect", async (i) => {
    try {
      if (i.customId === "setup_done") {
        await i.update({
          content: `${FIRE} **Setup complete!** Your server is now fully configured.`,
          components: [],
          embeds: [generateEmbed().setColor(colors.CORE)],
        }).catch(() => {});
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
        return collector.stop();
      }

      const settings = fs.existsSync(settingsPath)
        ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
        : {};

      if (i.customId === "setup_category") {
        currentCategory = i.values[0];
        await i.update({
          embeds: [generateEmbed()],
          components: generateRows(),
        }).catch(() => {});
      } 
      
      else if (i.customId === "setup_channel") {
        const channelId = i.values[0];
        const channel = i.guild.channels.cache.get(channelId);

        if (channel && (currentCategory === "download" || currentCategory === "private")) {
          if (!channel.nsfw) {
            await channel.setNSFW(true, "MaveL Setup: Safety compliance check - Automatic age restriction.").catch(() => {});
          }
        }
        
        if (currentCategory === "download") {
          settings.downloadChannelId = channelId;
          config.allowedChannelId = channelId;
        } else if (currentCategory === "logs") {
          settings.logsChannelId = channelId;
          config.logsChannelId = channelId;
        } else if (currentCategory === "music") {
          settings.musicChannelId = channelId;
          config.musicChannelId = channelId;
        } else if (currentCategory === "private") {
          settings.adminChannelId = channelId;
          config.adminChannelId = channelId;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        await i.update({ embeds: [generateEmbed()], components: generateRows() }).catch(() => {});
      }

    } catch (err) {
      console.error("[SETUP-ERROR]", err.message);
    }
  });
};
