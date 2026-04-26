const inspectorHandler = require("../../handlers/tools/inspector");

module.exports = {
  name: "inspect",
  async execute(interaction, client) {
    return await inspectorHandler(interaction);
  },
};
