const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "scan",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
