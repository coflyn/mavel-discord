const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder().setName("pause").setDescription("Pause the music"),
  name: "pause",
  async execute(interaction, client) {
    player.pause(interaction.guild.id);
    const E_PAUSE = interaction.guild.emojis.cache.find((e) => e.name === "time")?.toString() || "⏸️";
    await interaction.reply({
      content: `### ${E_PAUSE} **Music Paused.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  },
};
