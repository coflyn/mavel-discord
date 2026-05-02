const { SlashCommandBuilder } = require("discord.js");
const { MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { resetTunnel } = require("../../utils/tunnel-server");
const config = require("../../config");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("reset")
      .setDescription("Fix connection or system issues")
      .addSubcommand((sub) =>
        sub.setName("tunnel").setDescription("Fix connection issues"),
      ),
  name: "reset",
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === "tunnel") {
      if (!interaction.member.permissions.has("Administrator")) {
        await interaction.reply({
          content:
            "*Error: You need Administrator permission to use this command.*",
          flags: [MessageFlags.Ephemeral],
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const E_SUCCESS = resolveEmoji(interaction.guild, "ping_green", "✅");
      const E_ERROR = resolveEmoji(interaction.guild, "ping_red", "🔴");

      try {
        await resetTunnel(config.tunnelPort);
        await interaction.editReply({
          content:
            `### ${E_SUCCESS} **Tunnel Reset Successful**\n> *Cloudflare tunnel has been restarted and re-established.*`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
      } catch (err) {
        await interaction.editReply({
          content: `### ${E_ERROR} **Tunnel Reset Failed**\n> *Error: ${err.message}*`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
      }
    }
  },
};
