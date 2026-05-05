const { EmbedBuilder, MessageFlags } = require("discord.js");
const Tesseract = require("tesseract.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { botBanner } = require("../../config");

module.exports = {
  name: "app_ocr",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const msg = interaction.targetMessage;

    const banner = botBanner || "";
    let imageUrl = null;

    const attachment = msg.attachments.find((a) =>
      a.contentType?.startsWith("image/"),
    );
    if (attachment) imageUrl = attachment.url;

    if (!imageUrl && msg.embeds.length > 0) {
      const validEmbed = msg.embeds.find((e) => {
        const url = e.image?.url || e.thumbnail?.url;
        return url && (!botBanner || !url.includes(botBanner));
      });
      if (validEmbed) imageUrl = validEmbed.image?.url || validEmbed.thumbnail?.url;
    }

    if (!imageUrl) {
      return interaction.editReply({
        content: "*Error: No valid image found to extract text from.*",
      });
    }

    try {
      const PC = resolveEmoji(interaction, "pc", "💻");
      await interaction.editReply({
        content: `${PC} *Extracting text from image, please wait...*`,
      });

      const {
        data: { text },
      } = await Tesseract.recognize(imageUrl, "eng", {
        logger: (m) => {},
      });

      if (!text || !text.trim()) {
        return await interaction.editReply({
          content: "*Sorry, could not read any clear text from this image.*",
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#9b59b6")
        .setAuthor({
          name: "Extracted Text (OCR)",
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`\`\`\`\n${text.substring(0, 4000)}\n\`\`\``)
        .setFooter({ text: "Tesseract OCR" });

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[OCR] Error:", e);
      await interaction.editReply({
        content: `*Error occurred during OCR extraction:* \`${e.message}\``,
      });
    }
  },
};
