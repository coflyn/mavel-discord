const { MessageFlags } = require("discord.js");

module.exports = {
  name: "app_format",
  async execute(interaction) {
    const msg = interaction.targetMessage;

    if (!msg.content) {
      return interaction.reply({
        content: "*Error: Could not find any text to format in this message.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (msg.content.includes("```")) {
      return interaction.reply({
        content: "*Error: This message already contains codeblocks.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply();

    try {
      let lang = "";
      if (
        msg.content.includes("const ") ||
        msg.content.includes("let ") ||
        msg.content.includes("=>")
      ) {
        lang = "js";
      } else if (
        msg.content.includes("def ") ||
        msg.content.includes("print(")
      ) {
        lang = "py";
      } else if (msg.content.includes("{") && msg.content.includes("}")) {
        lang = "json";
      }

      await interaction.editReply({
        content: `**Formatted Code from ${msg.author}:**\n\`\`\`${lang}\n${msg.content}\n\`\`\``,
      });
    } catch (e) {
      await interaction.editReply({ content: `*Failed to format code.*` });
    }
  },
};
