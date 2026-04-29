const { SlashCommandBuilder } = require("discord.js");
const harvestHandler = require("../../handlers/tools/harvest");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("harvest")
      .setDescription("Analyze and get info from social profiles")
      .addStringOption((opt) =>
        opt
          .setName("target")
          .setDescription("Choose platform to harvest")
          .setRequired(false)
          .addChoices(
            { name: "TikTok", value: "tiktok" },
            { name: "Instagram", value: "instagram" },
            { name: "YouTube", value: "youtube" },
            { name: "GitHub", value: "github" },
            { name: "Reddit", value: "reddit" },
            { name: "Social Finder", value: "find" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("Username, URL, or Topic")
          .setRequired(false),
      ),
  name: "harvest",
  async execute(interaction, client) {
    return await harvestHandler(interaction);
  },
};
