const downloaderHandler = require("../../handlers/downloader");

module.exports = {
  name: "dl",
  async execute(interaction, client) {
    return await downloaderHandler(interaction);
  },
};
