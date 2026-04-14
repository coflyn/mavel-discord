const emojiHandler = require("../../handlers/tools/emoji");

module.exports = {
  name: "emoji",
  async execute(interaction, client) {
    return await emojiHandler(interaction);
  },
};
