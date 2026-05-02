const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const setupHandler = require("../../handlers/tools/setup");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("setup")
      .setDescription("Configure server channels for the bot"),
  name: "setup",
  async execute(interaction, client) {
    return await setupHandler(interaction);
  },
};
