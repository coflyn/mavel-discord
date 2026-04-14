const diagnosticsHandler = require("../../handlers/tools/diagnostics");

module.exports = {
  name: "diagnostics",
  async execute(interaction, client) {
    return await diagnosticsHandler(interaction);
  },
};
