const { SlashCommandBuilder } = require("discord.js");
const { MessageFlags } = require("discord.js");

module.exports = {
  slashData: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot speed and connection"),
  name: "ping",
  async execute(interaction, client) {
    const guildEmojis = await interaction.guild.emojis.fetch();
    const latencyVal = client.ws.ping;
    const latency = latencyVal < 0 ? 0 : Math.round(latencyVal);
    const pingEmoji =
      latency < 100
        ? guildEmojis.find((e) => e.name === "ping_green") || "🟢"
        : guildEmojis.find((e) => e.name === "ping_red") || "🔴";

    if (interaction.reply) {
      const reply = await interaction.reply({
        content: `*${pingEmoji} Latency is ${latency}ms.*`,
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });

      const res = reply?.resource || reply;
      setTimeout(() => {
        if (interaction.isChatInputCommand?.()) {
          interaction.deleteReply().catch(() => {});
        } else if (res && res.delete) {
          res.delete().catch(() => {});
        }
      }, 30000);
    }
  },
};
