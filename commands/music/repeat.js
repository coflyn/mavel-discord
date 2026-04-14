const { player } = require("../../handlers/music");

module.exports = {
  name: "repeat",
  async execute(interaction, client) {
    const mode = interaction.options.getString("mode");
    player.setRepeat(interaction.guild.id, mode);
    const E_REPEAT = interaction.guild.emojis.cache.find((e) => e.name === "rocket")?.toString() || "🔁";

    const state = player.queues.get(interaction.guild.id);
    if (state && state.lastNowPlayingMsg) {
      const updatedEmbed = player.getNowPlayingEmbed(interaction.guild.id);
      if (updatedEmbed) {
        state.lastNowPlayingMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
      }
    }

    await interaction.reply({
      content: `### ${E_REPEAT} **Repeat Mode: ${mode.toUpperCase()}**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
