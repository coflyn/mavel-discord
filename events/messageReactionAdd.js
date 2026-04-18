const { EmbedBuilder } = require("discord.js");

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
      ["check", "verified", "blue_check"].includes(emoji.name?.toLowerCase()) ||
      emoji.name === "✅" ||
      emoji.name === "☑️";
    if (!isCheck) return;

    if (!message.author || !reaction.client.user) return;
    if (message.author.id !== reaction.client.user.id) return;

    const embed = message.embeds[0];
    const isReport = embed && embed.title && (
      embed.title.toLowerCase().includes("ready") || 
      embed.title.toLowerCase().includes("large")
    );
    if (!embed || !isReport) return;
    

    const desc = embed.description || "";
    const linkMatch = desc.match(/\[Original Link\]\(<([^>]+)>\)/);
    if (!linkMatch) return;

    const url = linkMatch[1];
    const titleField = embed.fields?.find((f) => f.name.includes("Title"));
    const cleanTitle =
      titleField?.value.replace(/\*/g, "").substring(0, 100) || "Media";

    try {
      const guildEmojis = message.guild
        ? await message.guild.emojis.fetch().catch(() => null)
        : null;
      const getE = (n, fallback) =>
        guildEmojis?.find((e) => e.name === n)?.toString() || fallback;

      const E_ANNO = getE("anno", "📑");
      const E_ARROW = getE("arrow", "»");

      const dmEmbed = new EmbedBuilder()
        .setColor(embed.color || "#6c5ce7")
        .setAuthor({
          name: "MaveL Bookmark Service",
          iconURL: client.user.displayAvatarURL(),
        })
        .setTitle(`${E_ANNO} **Content Bookmarked**`);
      const thumbnail = embed.thumbnail?.url || embed.image?.url;
      if (thumbnail) dmEmbed.setThumbnail(thumbnail);

      dmEmbed
        .setDescription(
          `You bookmarked this media via reaction in **${message.guild?.name || "a server"}**.\n\n` +
            `${E_ARROW} **Title:** *${cleanTitle}*\n` +
            `${E_ARROW} **Source:** ${url}`,
        )
        .setFooter({ text: "MaveL", iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (err) {
      // Silent
    }
  },
};
