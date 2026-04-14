const infoHandler = require("../../handlers/info");

module.exports = {
  name: "icon",
  async execute(interaction, client) {
    return await infoHandler(interaction);
  },
};
