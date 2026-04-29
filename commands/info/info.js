const { SlashCommandBuilder } = require("discord.js");
const infoHandler = require("../../handlers/info");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("info")
      .setDescription("Check user info and profile")
      .addUserOption((opt) =>
        opt
          .setName("target")
          .setDescription("The user to check info for")
          .setRequired(false),
      ),
  name: "info",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
