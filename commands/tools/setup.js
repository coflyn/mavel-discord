const setupHandler = require("../../handlers/tools/setup");

module.exports = {
  name: "setup",
  async execute(interaction, client) {
    return await setupHandler(interaction);
  },
};
