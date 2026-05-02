const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("logs")
      .setDescription("View the last 15 system logs"),
  name: "logs",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
