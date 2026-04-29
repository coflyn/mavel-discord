const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");
const config = require("../../config");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("skip")
      .setDescription("Skip the current song"),
  name: "skip",
  async execute(interaction, client) {
    player.skip(interaction.guild.id);
    const E_NEXT = interaction.guild.emojis.cache.find((e) => e.name === "blue_arrow_right")?.toString() || "⏭️";
    await interaction.reply({
      content: `### ${E_NEXT} **Song skipped. Moving to next.**`,
      flags: [64],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), config.timeouts.quickReply);
  },
};
