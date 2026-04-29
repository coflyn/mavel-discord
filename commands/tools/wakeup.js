const { SlashCommandBuilder } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("wakeup")
      .setDescription("Wake up the bot from sleep mode"),
  name: "wakeup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
