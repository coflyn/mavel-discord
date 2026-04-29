const { SlashCommandBuilder } = require("discord.js");
const downloaderHandler = require("../../handlers/downloader");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("dl")
      .setDescription("Universal media downloader")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Paste any link here (TikTok, IG, YT, etc.)")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Choose download type (default: mp4)")
          .addChoices(
            { name: "Video (MP4)", value: "mp4" },
            { name: "Audio (MP3)", value: "mp3" },
            { name: "Gallery (ZIP/Photos)", value: "photo" },
          ),
      )
      .addStringOption((option) =>
        option
          .setName("resolution")
          .setDescription("Choose video resolution (default: 720p)")
          .addChoices(
            { name: "720p", value: "720" },
            { name: "1080p", value: "1080" },
          ),
      ),
  name: "dl",
  async execute(interaction, client) {
    return await downloaderHandler(interaction);
  },
};
