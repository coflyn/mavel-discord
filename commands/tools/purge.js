const { SlashCommandBuilder } = require("discord.js");
const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Clean up or reset server data (Admin Only)")
      .addStringOption((opt) =>
        opt
          .setName("target")
          .setDescription("What do you want to clean up?")
          .setRequired(true)
          .addChoices(
            { name: "Temporary Files", value: "temp" },
            { name: "System Logs", value: "logs" },
          ),
      ),
  name: "purge",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
