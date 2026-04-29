const { SlashCommandBuilder } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("backup")
      .setDescription("Backup the current bot settings"),
  name: "backup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
