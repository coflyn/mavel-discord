const { SlashCommandBuilder } = require("discord.js");
const emojiHandler = require("../../handlers/tools/emoji");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("emoji")
      .setDescription("Manage server emojis")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add an emoji from ID, Link, or existing Emoji")
          .addStringOption((opt) =>
            opt
              .setName("input")
              .setDescription("Emoji ID, Link, or Emoji")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("name")
              .setDescription("Name for the emoji")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete an emoji from the server")
          .addStringOption((opt) =>
            opt
              .setName("query")
              .setDescription("Emoji name or ID")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("rename")
          .setDescription("Rename an emoji")
          .addStringOption((opt) =>
            opt
              .setName("current")
              .setDescription("Current emoji name or ID")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("new")
              .setDescription("New name for the emoji")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("info")
          .setDescription("Get detailed info about an emoji")
          .addStringOption((opt) =>
            opt
              .setName("emoji")
              .setDescription("The emoji to check")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List all custom emojis in the server"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("needs")
          .setDescription("Check and add missing system emojis"),
      ),
  name: "emoji",
  async execute(interaction, client) {
    return await emojiHandler(interaction);
  },
};
