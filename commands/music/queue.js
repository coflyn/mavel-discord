const { player } = require("../../handlers/music");
const { EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  name: "queue",
  async execute(interaction, client) {
    const list = player.getQueueList(interaction.guild.id);
    const E_ANNO = interaction.guild.emojis.cache.find((e) => e.name === "anno")?.toString() || "📜";
    const E_FIRE = interaction.guild.emojis.cache.find((e) => e.name === "purple_fire")?.toString() || "🔥";

    if (list.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor("#a29bfe")
        .setDescription(`### ${E_FIRE} **Queue: Empty**\n> *No songs found in the queue.*`);

      await interaction.reply({ embeds: [emptyEmbed], flags: [64] });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    const queueEmbed = new EmbedBuilder()
      .setColor("#a29bfe")
      .setAuthor({
        name: "MaveL Operation Queue",
        iconURL: client.user.displayAvatarURL(),
      })
      .setDescription(`### ${E_ANNO} **Track List**\n` + list.join("\n"))
      .setFooter({ text: `Hub | Pending Operations: ${list.length}` });

    await interaction.reply({ embeds: [queueEmbed], flags: [64] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), config.timeouts.embedReply);
  },
};
