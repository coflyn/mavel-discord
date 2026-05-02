const { MessageFlags } = require("discord.js");

module.exports = {
  name: "app_format",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const msg = interaction.targetMessage;

    let textToFormat = msg.content;

    if (!textToFormat && msg.embeds.length > 0) {
      textToFormat = msg.embeds[0].description || msg.embeds[0].title;
    }

    if (!textToFormat) {
      return interaction.editReply({
        content: "*Error: Could not find any text to format in this message.*",
      });
    }

    if (textToFormat.includes("```")) {
      return interaction.editReply({
        content: "*Error: This message already contains codeblocks.*",
      });
    }

    try {
      let lang = "";
      if (
        textToFormat.includes("const ") ||
        textToFormat.includes("let ") ||
        textToFormat.includes("=>")
      ) {
        lang = "js";
      } else if (
        textToFormat.includes("def ") ||
        textToFormat.includes("print(")
      ) {
        lang = "py";
      } else if (textToFormat.includes("{") && textToFormat.includes("}")) {
        lang = "json";
      }

      await interaction.editReply({
        content: `**Formatted Code from ${msg.author}:**\n\`\`\`${lang}\n${textToFormat.substring(0, 1900)}\n\`\`\``,
      });
    } catch (e) {
      await interaction.editReply({ content: `*Failed to format code.*` });
    }
  },
};
