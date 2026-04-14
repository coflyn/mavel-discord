const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "backup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
