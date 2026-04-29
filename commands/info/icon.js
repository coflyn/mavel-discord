const { SlashCommandBuilder } = require("discord.js");
const infoHandler = require("../../handlers/info");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("icon")
      .setDescription("Get high-res icon")
      .addUserOption((opt) =>
        opt
          .setName("target")
          .setDescription("Choose a user (Leave empty for Server)")
          .setRequired(false),
      ),
  name: "icon",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
