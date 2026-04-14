const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "hibernate",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
