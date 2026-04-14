const helpHandler = require("../../handlers/tools/help");

module.exports = {
  name: "help",
  async execute(interaction, client) {
    return await helpHandler(interaction);
  },
};
