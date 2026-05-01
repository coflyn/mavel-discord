const { SlashCommandBuilder } = require("discord.js");
const traceHandler = require("../../handlers/search/trace-handler");

module.exports = {
  slashData: new SlashCommandBuilder()
    .setName("trace")
    .setDescription("Identify an anime or movie from an image frame")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("What are you tracing?")
        .setRequired(true)
        .addChoices(
          { name: "Anime (Precision)", value: "anime" },
          { name: "Movie / General (Visual Search)", value: "movie" },
        ),
    )
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("The frame image to trace").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("url").setDescription("The image URL to trace").setRequired(false)
    ),
  name: "trace",
  async execute(interaction, client) {
    return await traceHandler(interaction);
  },
};
