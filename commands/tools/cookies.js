const cookiesHandler = require("../../handlers/tools/cookies");

module.exports = {
  name: "cookies",
  async execute(interaction, client) {
    return await cookiesHandler(interaction);
  },
};
