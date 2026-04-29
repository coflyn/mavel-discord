const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Clear the music queue"),
  name: "clear",
  async execute(interaction, client) {
    player.clear(interaction.guild.id);
    const E_CLEAR = interaction.guild.emojis.cache.find((e) => e.name === "lea")?.toString() || "🗑️";
    await interaction.reply({
      content: `### ${E_CLEAR} **Queue Cleared.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
