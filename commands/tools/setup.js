const { SlashCommandBuilder } = require("discord.js");
const setupHandler = require("../../handlers/tools/setup");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Configure server channels for the bot"),
  name: "setup",
  async execute(interaction, client) {
    return await setupHandler(interaction);
  },
};
