const searchHandler = require("../../handlers/search");

module.exports = {
  name: "search",
  async execute(interaction, client) {
    return await searchHandler(interaction);
  },
};
