const ssHandler = require("../../handlers/tools/ss");

module.exports = {
  name: "ss",
  async execute(interaction, client) {
    return await ssHandler(interaction);
  },
};
