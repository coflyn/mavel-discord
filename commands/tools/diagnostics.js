const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const diagnosticsHandler = require("../../handlers/tools/diagnostics");

module.exports = {
  slashData: new SlashCommandBuilder().setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setName("diagnostics")
      .setDescription("Check bot system status"),
  name: "diagnostics",
  async execute(interaction, client) {
    return await diagnosticsHandler(interaction);
  },
};
