const { SlashCommandBuilder } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("hibernate")
      .setDescription("Put the bot into sleep mode (Admin Only)"),
  name: "hibernate",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
