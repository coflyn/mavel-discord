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
    const msg = interaction.targetMessage;

    if (!msg.content) {
      return interaction.reply({
        content:
          "*Error: Could not find any text to translate in this message.*",
        flags: [MessageFlags.Ephemeral],
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

    const initialResponse = await interaction.reply({
      content: `${GLOBE} **Select language for translation:**\n> *${msg.content.substring(0, 100).replace(/\n/g, " ")}${msg.content.length > 100 ? "..." : ""}*`,
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });

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
        const res = await translate(msg.content, { to: targetLangVal });
        const fromLang = res.raw?.src || "Auto";

        const embed = new EmbedBuilder()
          .setColor("#3498db")
          .setAuthor({
            name: `Translated from ${fromLang.toUpperCase()} to ${targetLangName}`,
            iconURL: msg.author.displayAvatarURL(),
          })
          .setDescription(
            `**Original:**\n${msg.content}\n\n**Translation:**\n${res.text}`,
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
