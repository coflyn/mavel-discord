const { MessageFlags } = require("discord.js");
const { resetTunnel } = require("../../utils/tunnel-server");
const config = require("../../config");

module.exports = {
  name: "reset",
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === "tunnel") {
      if (!interaction.member.permissions.has("Administrator")) {
        return await interaction.reply({
          content:
            "*Error: You need Administrator permission to use this command.*",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      try {
        await resetTunnel(config.tunnelPort);
        await interaction.editReply({
          content:
            "### ✅ **Tunnel Reset Successful**\n> *Cloudflare tunnel has been restarted and re-established.*",
        });
      } catch (err) {
        await interaction.editReply({
          content: `### 🔴 **Tunnel Reset Failed**\n> *Error: ${err.message}*`,
        });
      }
    }
  },
};
