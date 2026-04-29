const { SlashCommandBuilder } = require("discord.js");
const infoHandler = require("../../handlers/info");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("server")
      .setDescription("Check server info"),
  name: "server",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
