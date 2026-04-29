const { SlashCommandBuilder } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("scan")
      .setDescription("Check network safety and blocked sites"),
  name: "scan",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
