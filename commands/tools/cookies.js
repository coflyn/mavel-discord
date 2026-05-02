const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const cookiesHandler = require("../../handlers/tools/cookies");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("cookies")
      .setDescription("Update or refresh cookie settings"),
  name: "cookies",
  async execute(interaction, client) {
    return await cookiesHandler(interaction);
  },
};
