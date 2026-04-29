const { SlashCommandBuilder } = require("discord.js");
const { player } = require("../../handlers/music");
const { EmbedBuilder } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const config = require("../../config");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("queue")
      .setDescription("Show the song queue"),
  name: "queue",
  async execute(interaction, client) {
    const list = player.getQueueList(interaction.guild.id);
    const guild = interaction.guild;
    const E_ANNO = resolveEmoji(guild, "anno", "📜");
    const E_FIRE = resolveEmoji(guild, "purple_fire", "🔥");

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
