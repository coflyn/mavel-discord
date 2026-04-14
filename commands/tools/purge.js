const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "purge",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
