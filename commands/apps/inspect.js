const { SlashCommandBuilder } = require("discord.js");
const inspectorHandler = require("../../handlers/tools/inspector");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("inspect")
      .setDescription("Expose detailed info and EXIF data of a file")
      .addAttachmentOption((opt) =>
        opt
          .setName("file")
          .setDescription("The file to inspect")
          .setRequired(true),
      ),
  name: "inspect",
  async execute(interaction, client) {
    return await inspectorHandler(interaction);
  },
};
