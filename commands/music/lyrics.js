const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { findLyrics } = require("../../handlers/music/lyrics");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { player } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("lyrics")
      .setDescription("Find lyrics for the currently playing song")
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("Song name (optional)")
          .setRequired(false),
      ),
  name: "lyrics",
  async execute(interaction, client) {
    const query = interaction.options.getString("query");
    const guild = interaction.guild;
    const E_PC = resolveEmoji(guild, "pc", "📡");
    const E_BOOK = resolveEmoji(guild, "book", "📋");

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let searchQuery = query;
    if (!searchQuery) {
      const state = player.queues.get(guild.id);
      if (state && state.current) {
        searchQuery = state.current.title;
      }
    }

    if (!searchQuery) {
      await interaction.editReply({ content: "*Error: Please provide a song name or play music first.*" });
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }

    await interaction.editReply({ content: `${E_PC} *Searching for lyrics to:* **${searchQuery}**...` });

    try {
      const lyrics = await findLyrics(searchQuery);
      if (!lyrics || lyrics.includes("not found") || lyrics.includes("Error")) {
        await interaction.editReply({ content: `### ${E_BOOK} **Lyrics Search: Failed**\n*Could not find lyrics for that song.*` });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
      }

      await interaction.editReply({
        content: `### ${E_BOOK} **Lyrics: ${searchQuery}**\n\n${lyrics.substring(0, 1900)}`,
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 300000);
    } catch (err) {
      await interaction.editReply({ content: `*Error: ${err.message}*` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
    }
  },
};
