const { findLyrics } = require("../../handlers/music/lyrics");

module.exports = {
  name: "lyrics",
  async execute(interaction, client) {
    const query = interaction.options.getString("query");
    return await findLyrics(interaction, query);
  },
};
