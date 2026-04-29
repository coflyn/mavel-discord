const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("shuffle")
      .setDescription("Toggle shuffle mode")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("Shuffle mode")
          .setRequired(true)
          .addChoices({ name: "On", value: "on" }, { name: "Off", value: "off" }),
      ),
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
