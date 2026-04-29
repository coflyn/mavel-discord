const { EmbedBuilder } = require("discord.js");
const { resolveEmoji } = require("../utils/emoji-helper");

module.exports = {
  name: "messageReactionAdd",
  async execute(reaction, user, client) {
    if (user.bot) return;
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        return;
      }
    }

    const { message, emoji } = reaction;
    const isCheck =
      ["check", "verified", "blue_check", "ping_green"].includes(emoji.name?.toLowerCase()) ||
      emoji.name === "✅" ||
      emoji.name === "☑️";
    if (!isCheck) return;

    if (!message.author || !reaction.client.user) return;
    if (message.author.id !== reaction.client.user.id) return;

    const embed = message.embeds[0];
    if (!embed) return;

    const embedTitle = embed.title?.toLowerCase() || "";
    const isMaveL =
      embed.author?.name?.includes("MaveL") ||
      embed.footer?.text?.includes("MaveL");
    const isReport =
      embedTitle.includes("ready") ||
      embedTitle.includes("large") ||
      embed.description?.includes("Original Link");

    if (!isMaveL || !isReport) return;

    const desc = embed.description || "";
    const linkMatch = desc.match(/\[Original Link\]\(<([^>]+)>\)/);
    if (!linkMatch) return;

    const url = linkMatch[1];
    let cleanTitle = "Media";

    const titleField = embed.fields?.find((f) => f.name.includes("Title"));
    if (titleField) {
      cleanTitle = titleField.value.replace(/\*/g, "");
    } else {
      const descTitleMatch = desc.match(/\*\*Title:\*\* \*([^*]+)\*/);
      if (descTitleMatch) cleanTitle = descTitleMatch[1];
    }

    try {
      const getEmoji = (n, fallback) => resolveEmoji(message.guild, n, fallback);

      const E_ANNO = getEmoji("anno", "📑");
      const E_ARROW = getEmoji("arrow", "»");

      const EC = require("../utils/embed-colors");
      const dmEmbed = new EmbedBuilder()
        .setColor(embed.color || EC.CORE)
        .setAuthor({
          name: "MaveL Bookmark Service",
          iconURL: reaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${E_ANNO} **Content Bookmarked**`);

      const thumbnailCandidate =
        embed.thumbnail?.url ||
        embed.image?.url ||
        embed.author?.iconURL ||
        message.client.user.displayAvatarURL();

      dmEmbed.setThumbnail(thumbnailCandidate);

      dmEmbed
        .setDescription(
          `You bookmarked this media via reaction in **${message.guild?.name || "a server"}**.\n\n` +
            `${E_ARROW} **Title:** *${cleanTitle.substring(0, 100)}*\n` +
            `${E_ARROW} **Source:** ${url}`,
        )
        .setFooter({
          text: "MaveL System",
          iconURL: reaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] }).catch((err) => {
        console.error(
          `[BOOKMARK-DM-FAIL] Could not send DM to ${user.tag}:`,
          err.message,
        );
      });
    } catch (err) {
      console.error("[BOOKMARK-ERROR]", err);
    }
  },
};
