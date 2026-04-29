const { SlashCommandBuilder } = require("discord.js");
const helpHandler = require("../../handlers/tools/help");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("help")
      .setDescription("View MaveL help guide"),
  name: "help",
  async execute(interaction, client) {
    return await helpHandler(interaction);
  },
};
