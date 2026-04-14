const converterHandler = require("../../handlers/tools/converter");

module.exports = {
  name: "convert",
  async execute(interaction, client) {
    return await converterHandler(interaction);
  },
};
