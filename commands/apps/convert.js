const { SlashCommandBuilder } = require("discord.js");
const converterHandler = require("../../handlers/tools/converter");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("convert")
      .setDescription("Media Converter (Video/Audio/Image)")
      .addStringOption((option) =>
        option
          .setName("to")
          .setDescription("Target format")
          .setRequired(true)
          .addChoices(
            { name: "Video: MP4 (HQ Compressed)", value: "mp4" },
            { name: "Video: MP4 (8MB Limit - No Nitro)", value: "mp4_small" },
            { name: "Video: GIF (High Quality)", value: "gif" },
            { name: "Video: GIF (Small/Fast)", value: "gif_small" },
            { name: "Audio: MP3 (320kbps)", value: "mp3" },
            { name: "Audio: OGG (Soundboard Ready)", value: "ogg" },
            { name: "Audio: WAV (Lossless)", value: "wav" },
            { name: "Image: PNG", value: "png" },
            { name: "Image: JPG", value: "jpg" },
            { name: "Image: WebP", value: "webp" },
            { name: "Document: Image to PDF", value: "pdf" },
            { name: "Document: Word (.docx) to PDF", value: "word_to_pdf" },
          ),
      )
      .addAttachmentOption((option) =>
        option
          .setName("file")
          .setDescription("The file you want to convert")
          .setRequired(true),
      ),
  name: "convert",
  async execute(interaction, client) {
    return await converterHandler(interaction);
  },
};
