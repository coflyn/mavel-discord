const { musicHandler } = require("../../handlers/music");

module.exports = {
  name: "play",
  async execute(interaction, client) {
    const query = interaction.options.getString("query");
    const source = interaction.options.getString("source") || "yt";
    return await musicHandler(interaction, { title: query, source });
  },
};
