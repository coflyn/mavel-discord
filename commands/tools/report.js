const { SlashCommandBuilder } = require("discord.js");
const reportHandler = require("../../handlers/tools/report");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("report")
      .setDescription("Report a bug, error, or issue to the developers"),
  name: "report",
  async execute(interaction, client) {
    return await reportHandler(interaction);
  },
};
