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
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const { resolveEmoji } = require("../../utils/emoji-helper");

const settingsPath = path.join(__dirname, "..", "..", "database", "settings.json");

module.exports = async function setupHandler(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "*You don't have permission to use this command.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const NOTIF = resolveEmoji(interaction.guild, "notif", "🔔");
  const ARROW = resolveEmoji(interaction.guild, "arrow", "•");
  const FIRE = resolveEmoji(interaction.guild, "purple_fire", "🔥");
  const CHANNEL = resolveEmoji(interaction.guild, "pc", "💾");
  const LOGS = resolveEmoji(interaction.guild, "book", "📜");
  const MUSIC = resolveEmoji(interaction.guild, "notif", "🎵");
  const TEMPLE = resolveEmoji(interaction.guild, "megaphone", "🏛️");
  const ADMIN = resolveEmoji(interaction.guild, "diamond", "🛡️");
  const CHECK = resolveEmoji(interaction.guild, "check", "✅");
  const LEA = resolveEmoji(interaction.guild, "lea", "👥");

  let currentCategory = "download";

  const generateEmbed = () => {
    const catNames = {
      download: "Downloader",
      logs: "General Logs",
      music: "Music Control",
      gateway: "Gateway (Welcome/Goodbye)",
      private: "Private Admin",
      autorole: "Auto Role (New Members)",
    };

    const roleName = config.autoRoleId ? (interaction.guild.roles.cache.get(config.autoRoleId)?.name || "Unknown Role") : "Not Set";

    return new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${NOTIF} **MaveL Server Setup**`)
      .setDescription(`${ARROW} *Current Category:* **${catNames[currentCategory]}**`)
      .addFields({
        name: "**Current Settings**",
        value:
          `${ARROW} **Download:** <#${config.allowedChannelId || "Not Set"}>\n` +
          `${ARROW} **Logs:** <#${config.logsChannelId || "Not Set"}>\n` +
          `${ARROW} **Music:** <#${config.musicChannelId || "Not Set"}>\n` +
          `${ARROW} **Gateway:** <#${config.gatewayChannelId || "Not Set"}>\n` +
          `${ARROW} **Private Admin:** <#${config.adminChannelId || "Not Set"}>\n` +
          `${ARROW} **Auto Role:** \`${roleName}\``,
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
            { label: "Gateway (Welcome/Env)", value: "gateway", emoji: TEMPLE, default: currentCategory === "gateway" },
            { label: "Private Admin Channel", value: "private", emoji: ADMIN, default: currentCategory === "private" },
            { label: "Auto Role Member", value: "autorole", emoji: LEA, default: currentCategory === "autorole" },
          ])
      )
    ];

    if (currentCategory === "autorole") {
      const { RoleSelectMenuBuilder } = require("discord.js");
      rows.push(
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId("setup_role")
            .setPlaceholder("Step 2: Select Auto-Role for New Members...")
            .setMinValues(1)
            .setMaxValues(1)
        )
      );
    } else {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("setup_channel")
            .setPlaceholder(`Step 2: Select Channel...`)
            .addChannelTypes(ChannelType.GuildText)
        )
      );
    }

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
          embeds: [generateEmbed().setColor("#27ae60")],
        }).catch(() => {});
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
        } else if (currentCategory === "gateway") {
          settings.gatewayChannelId = channelId;
          config.gatewayChannelId = channelId;
        } else if (currentCategory === "private") {
          settings.adminChannelId = channelId;
          config.adminChannelId = channelId;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        await i.update({ embeds: [generateEmbed()], components: generateRows() }).catch(() => {});
      }

      else if (i.customId === "setup_role") {
        const roleId = i.values[0];
        settings.autoRoleId = roleId;
        config.autoRoleId = roleId;

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        await i.update({
          embeds: [generateEmbed()],
          components: generateRows(),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[SETUP-ERROR]", err.message);
    }
  });
};
