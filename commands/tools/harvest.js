const harvestHandler = require("../../handlers/tools/harvest");

module.exports = {
  name: "harvest",
  async execute(interaction, client) {
    return await harvestHandler(interaction);
  },
};
