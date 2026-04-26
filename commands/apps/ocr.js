const { EmbedBuilder, MessageFlags } = require("discord.js");
const Tesseract = require("tesseract.js");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = {
  name: "app_ocr",
  async execute(interaction) {
    const msg = interaction.targetMessage;

    const attachment = msg.attachments.find((a) =>
      a.contentType?.startsWith("image/"),
    );

    if (!attachment) {
      return interaction.reply({
        content: "*Error: No image attachment found in this message.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const PC = resolveEmoji(interaction.guild, "pc", "💻");
      await interaction.editReply({
        content: `${PC} *Extracting text from image, please wait...*`,
      });

      const {
        data: { text },
      } = await Tesseract.recognize(attachment.url, "eng", {
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
