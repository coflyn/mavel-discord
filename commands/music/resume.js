const { player } = require("../../handlers/music");

module.exports = {
  name: "resume",
  async execute(interaction, client) {
    player.resume(interaction.guild.id);
    const E_RESUME = interaction.guild.emojis.cache.find((e) => e.name === "time")?.toString() || "▶️";
    await interaction.reply({
      content: `### ${E_RESUME} **Music Resumed.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
