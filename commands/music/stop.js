const { player } = require("../../handlers/music");

module.exports = {
  name: "stop",
  async execute(interaction, client) {
    player.stop(interaction.guild.id);
    const E_STOP = interaction.guild.emojis.cache.find((e) => e.name === "ping_red")?.toString() || "⏹️";
    await interaction.reply({
      content: `### ${E_STOP} **Bot stopped.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
