const adminCmdsHandler = require("../../handlers/tools/admin-cmds");

module.exports = {
  name: "wakeup",
  async execute(interaction, client) {
    return await adminCmdsHandler(interaction);
  },
};
