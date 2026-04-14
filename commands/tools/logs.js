const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "logs",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
