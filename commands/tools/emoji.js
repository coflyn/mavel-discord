const { SlashCommandBuilder } = require("discord.js");
const emojiHandler = require("../../handlers/tools/emoji");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("emoji")
      .setDescription("Manage server emojis")
      .addSubcommand((sub) =>
        sub
          .setName("needs")
          .setDescription("Check and add missing system emojis"),
      ),
  name: "emoji",
  async execute(interaction, client) {
    return await emojiHandler(interaction);
  },
};
