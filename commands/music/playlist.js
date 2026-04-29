const { player } = require("../../handlers/music");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { savePlaylist, getPlaylists, deletePlaylist } = require("../../utils/playlist-helper");

module.exports = {
  name: "playlist",
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "save") {
      const name = interaction.options.getString("name");
      const state = player.queues.get(interaction.guild.id);
      if (!state || (state.queue.length === 0 && !state.current)) {
        await interaction.reply({
          content: "*Nothing is playing or in queue.*",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      const allTracks = state.current ? [state.current, ...state.queue] : state.queue;
      savePlaylist(userId, name, allTracks);
      await interaction.reply({
        content: `*Playlist '${name}' saved with ${allTracks.length} tracks.*`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (sub === "list") {
      const lists = getPlaylists(userId);
      const names = Object.keys(lists);
      const FIRE = interaction.guild.emojis.cache.find((e) => e.name === "purple_fire")?.toString() || "🔥";

      if (names.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor("#a29bfe")
          .setDescription(`### ${FIRE} **No Playlists**\n> *You haven't saved any playlists yet.*`);

        await interaction.reply({ embeds: [emptyEmbed], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const LEA = interaction.guild.emojis.cache.find((e) => e.name === "ping_green")?.toString() || "✅";
      const ARROW = interaction.guild.emojis.cache.find((e) => e.name === "arrow")?.toString() || "•";

      const listEmbed = new EmbedBuilder()
        .setColor("#a29bfe")
        .setDescription(`### ${LEA} **Saved Playlists**\n` + names.map((n) => `${ARROW} \`${n}\` (${lists[n].length} tracks)`).join("\n"))
        .setFooter({ text: `MaveL | Total Playlists: ${names.length}` });

      await interaction.reply({ embeds: [listEmbed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (sub === "view") {
        const name = interaction.options.getString("name");
        const playlists = getPlaylists(userId);
        const list = playlists[name.toLowerCase()];
        if (!list) return await interaction.reply({ content: `*Playlist '${name}' not found.*`, flags: [MessageFlags.Ephemeral] });

        const tracks = list.slice(0, 20).map((t, i) => `\`${i + 1}.\` ${t.title}`).join("\n");
        const suffix = list.length > 20 ? `\n*...and ${list.length - 20} more tracks.*` : "";

        const viewEmbed = new EmbedBuilder()
          .setColor("#a29bfe")
          .setTitle(`Playlist: ${name}`)
          .setDescription(`${tracks}${suffix}`)
          .setFooter({ text: `Total: ${list.length} tracks` });

        await interaction.reply({ embeds: [viewEmbed], flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (sub === "delete") {
        const name = interaction.options.getString("name");
        if (!deletePlaylist(userId, name)) return await interaction.reply({ content: `*Playlist '${name}' not found.*`, flags: [MessageFlags.Ephemeral] });
        await interaction.reply({ content: `*Playlist '${name}' deleted.*`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (sub === "play") {
        const name = interaction.options.getString("name");
        const playlists = getPlaylists(userId);
        const list = playlists[name.toLowerCase()];
        if (!list) return await interaction.reply({ content: `*Playlist '${name}' not found.*`, flags: [MessageFlags.Ephemeral] });

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        try {
          await player.playBatch(interaction, list);
          await interaction.editReply({ content: `*Enqueued ${list.length} tracks from playlist '${name}'.*` });
        } catch (e) {
          await interaction.editReply({ content: `*Error: ${e.message}*` });
        }
    }
  },
};
