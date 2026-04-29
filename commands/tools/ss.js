const { SlashCommandBuilder } = require("discord.js");
const ssHandler = require("../../handlers/tools/ss");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("ss")
      .setDescription("Capture a high-quality screenshot of any website")
      .addStringOption((opt) =>
        opt.setName("url").setDescription("The website URL").setRequired(true),
      )
      .addBooleanOption((opt) =>
        opt
          .setName("full")
          .setDescription("Capture the entire scrollable page? (Default: False)")
          .setRequired(false),
      ),
  name: "ss",
  async execute(interaction, client) {
    return await ssHandler(interaction);
  },
};
