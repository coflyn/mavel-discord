const { player } = require("../../handlers/music");

module.exports = {
  name: "remove",
  async execute(interaction, client) {
    const num = interaction.options.getInteger("number");
    const removed = player.remove(interaction.guild.id, num);
    const E_CLEAR = interaction.guild.emojis.cache.find((e) => e.name === "lea")?.toString() || "🗑️";
    if (!removed) {
      await interaction.reply({
        content: `### ${E_CLEAR} **Target not found at position #${num}.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }
    await interaction.reply({
      content: `### ${E_CLEAR} **Removed track: ${removed.title}**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
