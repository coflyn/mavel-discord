const infoHandler = require("../../handlers/info");

module.exports = {
  name: "server",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
