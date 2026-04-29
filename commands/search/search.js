const { SlashCommandBuilder } = require("discord.js");
const searchHandler = require("../../handlers/search");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search for music and videos")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Search platform")
          .addChoices(
            { name: "YouTube Music", value: "ytm" },
            { name: "YouTube", value: "yt" },
            { name: "Spotify", value: "spot" },
            { name: "Bandcamp", value: "bc" },
          ),
      )
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("What are you looking for?")
          .setRequired(false),
      ),
  name: "search",
  async execute(interaction, client) {
    return await searchHandler(interaction);
  },
};
