const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "app_report",
  async execute(interaction) {
    const msg = interaction.targetMessage;
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
      ActionRowBuilder,
    } = require("discord.js");

    const modal = new ModalBuilder()
      .setCustomId(`report_msg_${msg.id}`)
      .setTitle("Report Message");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason for reporting")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Why should this message be removed or reviewed?")
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

    await interaction.showModal(modal);
  },
};
