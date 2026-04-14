const inspectorHandler = require("../../handlers/tools/inspector");

module.exports = {
  name: "inspect", // Also used for "Inspect Media" context menu by interactionCreate
  async execute(interaction, client) {
    return await inspectorHandler(interaction);
  },
};
