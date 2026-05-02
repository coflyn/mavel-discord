const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("backup")
      .setDescription("Backup the current bot settings"),
  name: "backup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
