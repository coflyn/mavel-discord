const {
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = async function cookiesHandler(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "*Admin permission needed to use this command.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const getEmoji = (name, fallback) => {
    const emoji = interaction.guild.emojis.cache.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const NOTIF = getEmoji("notif", "🔔");
  const ARROW = getEmoji("arrow", "•");
  const LOCK = getEmoji("cash", "🔐");
  const SYNC = getEmoji("boost", "🚀");
  const STATUS = getEmoji("online", "📡");
  const DOCS = getEmoji("book", "📖");

  const generateEmbed = () => {
    const filePath = path.join(__dirname, "../../cookies.txt");
    const exists = fs.existsSync(filePath);
    let status = exists
      ? `${STATUS} **Active**`
      : `❌ **Cookies not found**`;
    let stats = "---";

    if (exists) {
      const statsObj = fs.statSync(filePath);
      const size = (statsObj.size / 1024).toFixed(2);
      const mtime = new Date(statsObj.mtime).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      stats = `\`${size} KB\` / *Updated at ${mtime}*`;
    }

    return new EmbedBuilder()
      .setColor("#d63031")
      .setAuthor({
        name: "MaveL Bot Settings",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${LOCK} **Cookies & Settings**`)
      .setDescription(
        `### ${DOCS} **Status Overview**\n` +
          `*Settings for accessing restricted content on various platforms like YouTube, Instagram, and TikTok.*`,
      )
      .addFields(
        {
          name: `${SYNC} **System Status**`,
          value: `${ARROW} ${status}`,
          inline: true,
        },
        {
          name: `${NOTIF} **Download Source**`,
          value: `${ARROW} \`cookies.txt\``,
          inline: true,
        },
        {
          name: `${DOCS} **Help & Instructions**`,
          value: `*Login to the sites you want, use a 'Cookie Editor' to export in **Netscape format**, then paste them here to download restricted videos.*`,
          inline: false,
        },
        {
          name: `${ARROW} **Cookie File Info**`,
          value: `> ${stats}`,
          inline: false,
        },
      )
      .setFooter({
        text: "Use the buttons below to update your settings.",
      });
  };

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cookies_update_btn")
      .setLabel("Update Cookies")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cookies_done")
      .setLabel("Save & Update")
      .setStyle(ButtonStyle.Success),
  );

  await interaction.reply({
    embeds: [generateEmbed()],
    components: [rowButtons],
    flags: [MessageFlags.Ephemeral],
  });

  const filter = (i) => i.user.id === interaction.user.id;
  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: 300000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "cookies_done") {
      await i
        .update({
          content: "*Cookies saved successfully and system updated.*",
          components: [],
          embeds: [],
        })
        .catch(() => {});
      return collector.stop();
    }

    if (i.customId === "cookies_update_btn") {
      const modal = new ModalBuilder()
        .setCustomId("cookies_modal_master")
        .setTitle("Update Cookies");

      const cookieInput = new TextInputBuilder()
        .setCustomId("cookie_data")
        .setLabel("Paste Netscape Cookie Content")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("# Netscape HTTP Cookie File\n...")
        .setRequired(true);

      const modalRow = new ActionRowBuilder().addComponents(cookieInput);
      modal.addComponents(modalRow);

      await i.showModal(modal);

      const submission = await i
        .awaitModalSubmit({
          filter: (sub) => sub.customId === "cookies_modal_master",
          time: 600000,
        })
        .catch(() => null);

      if (submission) {
        await submission
          .deferReply({ flags: [MessageFlags.Ephemeral] })
          .catch(() => {});

        const newData = submission.fields.getTextInputValue("cookie_data");
        const filePath = path.join(__dirname, "../../cookies.txt");

        try {
          let finalContent = "";
          let validNewCount = 0;
          if (fs.existsSync(filePath)) {
            const existingContent = fs.readFileSync(filePath, "utf-8");
            const cookieMap = new Map();
            const headerLines = [];

            existingContent.split("\n").forEach((line) => {
              if (line.startsWith("#") || !line.trim()) {
                if (line.includes("Netscape") || line.includes("generated"))
                  headerLines.push(line);
                return;
              }
              const parts = line.split("\t");
              if (parts.length >= 7) {
                const key = `${parts[0]}_${parts[5]}`;
                cookieMap.set(key, line.trim());
              }
            });

            newData.split("\n").forEach((line) => {
              if (line.startsWith("#") || !line.trim()) return;
              const parts = line.split("\t");
              if (parts.length >= 7) {
                const key = `${parts[0]}_${parts[5]}`;
                cookieMap.set(key, line.trim());
                validNewCount++;
              }
            });

            if (validNewCount === 0 && newData.trim().length > 0) {
              throw new Error(
                "Invalid format. Please paste valid Netscape (.txt) cookie content.",
              );
            }

            if (headerLines.length === 0) {
              headerLines.push(
                "# Netscape HTTP Cookie File",
                "# This is a merged file generated by MaveL.",
              );
            }

            finalContent =
              headerLines.join("\n") +
              "\n\n" +
              Array.from(cookieMap.values()).join("\n");
          } else {
            newData.split("\n").forEach((line) => {
              if (!line.startsWith("#") && line.split("\t").length >= 7)
                validNewCount++;
            });
            finalContent = newData;
          }

          fs.writeFileSync(filePath, finalContent, "utf-8");

          await submission
            .editReply({
              content: `✅ **cookies.txt** *updated and merged successfully (${validNewCount} cookies added).*`,
            })
            .catch(() => {});

          await interaction
            .editReply({
              embeds: [generateEmbed()],
            })
            .catch(() => {});
        } catch (err) {
          await submission
            .editReply({
              content: `❌ **Failed to update cookies:** *${err.message}*`,
            })
            .catch(() => {});
        }
      }
    }
  });
};
