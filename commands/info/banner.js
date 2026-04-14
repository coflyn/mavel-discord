const infoHandler = require("../../handlers/info");

module.exports = {
  name: "banner",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
