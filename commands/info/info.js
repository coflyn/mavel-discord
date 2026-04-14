const infoHandler = require("../../handlers/info");

module.exports = {
  name: "info",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
