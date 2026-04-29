const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("skipto")
      .setDescription("Skip to a specific song in queue")
      .addIntegerOption((opt) =>
        opt
          .setName("number")
          .setDescription("Song position in queue")
          .setRequired(true),
      ),
  name: "skipto",
  async execute(interaction, client) {
    const num = interaction.options.getInteger("number");
    const success = player.skipto(interaction.guild.id, num);
    const E_NEXT = interaction.guild.emojis.cache.find((e) => e.name === "blue_arrow_right")?.toString() || "⏭️";
    if (!success) {
      await interaction.reply({
        content: `### ${E_NEXT} **Tactical error: Track #${num} nonexistent.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }
    await interaction.reply({
      content: `### ${E_NEXT} **Advancing to track #${num}.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
