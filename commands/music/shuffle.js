const { player } = require("../../handlers/music");

module.exports = {
  name: "shuffle",
  async execute(interaction, client) {
    const mode = interaction.options.getString("mode");
    player.toggleShuffle(interaction.guild.id, mode);
    const E_SHUFFLE = interaction.guild.emojis.cache.find((e) => e.name === "diamond")?.toString() || "🔀";
    await interaction.reply({
      content: `### ${E_SHUFFLE} **Shuffle mode set to: ${mode.toUpperCase()}**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
