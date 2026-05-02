const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("wakeup")
      .setDescription("Wake up the bot from sleep mode"),
  name: "wakeup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
