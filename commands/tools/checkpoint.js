const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");

const dbPath = path.join(__dirname, "../../database/checkpoints.json");

module.exports = {
  slashData: new SlashCommandBuilder()
    .setName("checkpoint")
    .setDescription("View your saved message checkpoints"),
  name: "checkpoint",
  async execute(interaction) {
    const userId = interaction.user.id;

    if (!fs.existsSync(dbPath)) {
      return interaction.reply({
        content:
          "*You don't have any checkpoints yet. Right-click a message and select 'Add Checkpoint' first!*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const db = JSON.parse(fs.readFileSync(dbPath));
    const userCheckpoints = db[userId] || [];

    if (userCheckpoints.length === 0) {
      return interaction.reply({
        content: "*Your checkpoint list is empty.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const ARROW = resolveEmoji(interaction.guild, "arrow", "»");
    const FLAG = resolveEmoji(interaction.guild, "notif", "📍");
    const TIME = resolveEmoji(interaction.guild, "time", "⏳");

    const embed = new EmbedBuilder()
      .setColor(colors.CORE || "#3498db")
      .setAuthor({
        name: `${interaction.user.username}'s Checkpoints`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTitle(`${FLAG} **Saved Locations**`)
      .setDescription(
        userCheckpoints
          .map((c, i) => {
            const date = new Date(c.timestamp).toLocaleDateString("id-ID");
            const displayContent = c.content.startsWith("http")
              ? "Go to Message"
              : c.content;
            return `**${i + 1}. [${displayContent}](${c.url})**\n${ARROW} *From: ${c.author}* | ${TIME} *${date}*`;
          })
          .join("\n\n"),
      )
      .setFooter({
        text: "Links only work if the original message still exists.",
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("clear_checkpoints")
        .setLabel("Clear All")
        .setStyle(ButtonStyle.Danger),
    );

    const CHECK = resolveEmoji(interaction.guild, "ping_green", "✅");

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });

    const response = await interaction.fetchReply();

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "clear_checkpoints") {
        const freshDb = JSON.parse(fs.readFileSync(dbPath));
        delete freshDb[userId];
        fs.writeFileSync(dbPath, JSON.stringify(freshDb, null, 2));

        await i.update({
          content: `${CHECK} *All checkpoints have been cleared.*`,
          embeds: [],
          components: [],
        });
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
