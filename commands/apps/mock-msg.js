const { MessageFlags, AttachmentBuilder } = require("discord.js");

module.exports = {
  name: "app_mock",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const msg = interaction.targetMessage;

    let textToMock = msg.content;

    if (!textToMock && msg.embeds.length > 0) {
      textToMock = msg.embeds[0].description || msg.embeds[0].title;
    }

    if (!textToMock) {
      return interaction.editReply({
        content: "*Error: No text found to mock.*",
      });
    }

    try {
      const mockText = textToMock
        .split("")
        .map((char, index) => {
          return index % 2 === 0 ? char.toLowerCase() : char.toUpperCase();
        })
        .join("");

      await interaction.editReply({
        content: `**${msg.author} said:**\n*> ${mockText.substring(0, 1900)}*`,
      });
    } catch (e) {
      await interaction.editReply({ content: `*Failed to mock message.*` });
    }
  },
};
