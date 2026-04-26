const { MessageFlags, AttachmentBuilder } = require("discord.js");

module.exports = {
  name: "app_mock",
  async execute(interaction) {
    const msg = interaction.targetMessage;

    if (!msg.content) {
      return interaction.reply({
        content: "*Error: No text found to mock.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply();

    try {
      const mockText = msg.content
        .split("")
        .map((char, index) => {
          return index % 2 === 0 ? char.toLowerCase() : char.toUpperCase();
        })
        .join("");

      await interaction.editReply({
        content: `**${msg.author} said:**\n*> ${mockText}*`,
      });
    } catch (e) {
      await interaction.editReply({ content: `*Failed to mock message.*` });
    }
  },
};
