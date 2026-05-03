const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = async function reportHandler(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("report_bug")
    .setTitle("Report Bug / Issue");

  const titleInput = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Issue Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. TikTok downloader always fails")
    .setRequired(true)
    .setMaxLength(100);

  const descInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Details / Steps to Reproduce")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Please explain what happened...")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
  );

  await interaction.showModal(modal);
};
