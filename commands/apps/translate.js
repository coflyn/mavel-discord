const {
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const { translate } = require("@vitalets/google-translate-api");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = {
  name: "app_translate",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const msg = interaction.targetMessage;

    let textToTranslate = msg.content;

    if (!textToTranslate && msg.embeds.length > 0) {
      const validEmbed = msg.embeds.find((e) => e.description || e.title);
      if (validEmbed) {
        textToTranslate = validEmbed.description || validEmbed.title;
      }
    }

    if (!textToTranslate) {
      return interaction.editReply({
        content:
          "*Error: Could not find any text to translate in this message.*",
      });
    }

    const GLOBE = resolveEmoji(interaction.guild, "globe", "🌍");

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("translate_lang_select")
        .setPlaceholder("Select target language...")
        .addOptions([
          { label: "Indonesian", value: "id", emoji: "🇮🇩" },
          { label: "English", value: "en", emoji: "🇺🇸" },
          { label: "Japanese", value: "ja", emoji: "🇯🇵" },
          { label: "Korean", value: "ko", emoji: "🇰🇷" },
          { label: "Spanish", value: "es", emoji: "🇪🇸" },
          { label: "French", value: "fr", emoji: "🇫🇷" },
          { label: "German", value: "de", emoji: "🇩🇪" },
          { label: "Russian", value: "ru", emoji: "🇷🇺" },
          { label: "Chinese", value: "zh-CN", emoji: "🇨🇳" },
          { label: "Arabic", value: "ar", emoji: "🇸🇦" },
        ]),
    );

    await interaction.editReply({
      content: `${GLOBE} **Select language for translation:**\n> *${textToTranslate.substring(0, 100).replace(/\n/g, " ")}${textToTranslate.length > 100 ? "..." : ""}*`,
      components: [row],
    });

    const initialResponse = await interaction.fetchReply();

    const collector = initialResponse.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();

      const targetLangVal = i.values[0];
      const targetLangName = i.component.options.find(
        (o) => o.value === targetLangVal,
      ).label;

      try {
        const res = await translate(textToTranslate, { to: targetLangVal });
        const fromLang = res.raw?.src || "Auto";

        const embed = new EmbedBuilder()
          .setColor("#3498db")
          .setAuthor({
            name: `Translated from ${fromLang.toUpperCase()} to ${targetLangName}`,
            iconURL: msg.author.displayAvatarURL(),
          })
          .setDescription(
            `**Original:**\n${textToTranslate.substring(0, 1000)}${textToTranslate.length > 1000 ? "..." : ""}\n\n**Translation:**\n${res.text.substring(0, 4000)}`,
          )
          .setFooter({ text: "Google Translate" });

        await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [],
        });
      } catch (e) {
        console.error("[TRANSLATE] Error:", e.message);
        await interaction.editReply({
          content: `*Translation failed:* \`${e.message}\``,
          components: [],
        });
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time" && collected.size === 0) {
        await interaction
          .editReply({
            content: "*Translation request timed out.*",
            components: [],
          })
          .catch(() => {});
      }
    });
  },
};
