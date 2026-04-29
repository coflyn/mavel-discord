const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");
const { MessageFlags } = require("discord.js");
const config = require("../../config");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("nowplaying")
      .setDescription("Show the currently playing song"),
  name: "nowplaying",
  async execute(interaction, client) {
    const embed = player.getNowPlayingEmbed(interaction.guild.id);
    if (!embed) {
      return interaction.reply({
        content: "*Nothing is playing right now.*",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), config.timeouts.queueReply);
  },
};
