const { SlashCommandBuilder } = require("discord.js");
const { musicHandler } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("play")
      .setDescription("Play music from YouTube/Bandcamp")
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("Song title or link")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("source")
          .setDescription("Choose music source (default: YouTube)")
          .addChoices(
            { name: "YouTube", value: "yt" },
            { name: "Bandcamp", value: "bc" },
          ),
      ),
  name: "play",
  async execute(interaction, client) {
    const query = interaction.options.getString("query");
    const source = interaction.options.getString("source") || "yt";
    return await musicHandler(interaction, { title: query, source });
  },
};
