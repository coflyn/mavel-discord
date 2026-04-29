const { SlashCommandBuilder } = require("discord.js");
const infoHandler = require("../../handlers/info");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("banner")
      .setDescription("Get high-res banner")
      .addUserOption((opt) =>
        opt
          .setName("target")
          .setDescription("Choose a user (Leave empty for Server)")
          .setRequired(false),
      ),
  name: "banner",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
