const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { advanceLog } = require("../../utils/logger");

module.exports = {
  name: "app_delete",
  type: 3,
  async execute(interaction) {
    const targetMsg = interaction.targetMessage;
    const guild = interaction.guild;
    const client = interaction.client;

    const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
    const FIRE = getEmoji("purple_fire", "🔥");
    const ARROW = getEmoji("arrow", "»");
    const NOTIF = getEmoji("notif", "🔔");
    const TIME = getEmoji("time", "⏳");
    const CHECK = getEmoji("ping_green", "✅");
    const CROSS = getEmoji("ping_red", "❌");

    if (!targetMsg.pinnable && !targetMsg.deletable) {
      return interaction.reply({
        content: "*Error: This message cannot be deleted by the bot.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const voteEmbed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${NOTIF} **Community Vote: Delete Message**`)
      .setDescription(
        `### ${FIRE} **Voting to delete a message**\n` +
          `${ARROW} **Author:** ${targetMsg.author}\n` +
          `${ARROW} **Content:** \`\`\`${targetMsg.content ? targetMsg.content.substring(0, 100) : "Media/Embed Only"}\`\`\`\n` +
          `*Note: Owner's vote is automatically set to NO.*`,
      )
      .setFooter({
        text: "Voting lasts for 30 seconds",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.reply({ embeds: [voteEmbed] });
    const response = await interaction.fetchReply();

    try {
      await response.react(CHECK);
      await response.react(CROSS);
    } catch (e) {}

    const voters = new Map();

    const filter = (reaction, user) => {
      return [CHECK, CROSS].includes(reaction.emoji.name) && !user.bot;
    };

    const collector = response.createReactionCollector({
      filter,
      time: 30000,
      dispose: true,
    });

    collector.on("collect", async (reaction, user) => {
      if (voters.has(user.id) && voters.get(user.id) !== reaction.emoji.name) {
        try {
          await reaction.users.remove(user.id);
        } catch (e) {}
        return;
      }
      voters.set(user.id, reaction.emoji.name);
    });

    collector.on("remove", (reaction, user) => {
      if (voters.get(user.id) === reaction.emoji.name) {
        voters.delete(user.id);
      }
    });

    collector.on("end", async () => {
      let yesVotes = 0;
      let noVotes = 1;

      voters.forEach((emojiName) => {
        if (emojiName === CHECK) yesVotes++;
        else noVotes++;
      });

      const resultEmbed = new EmbedBuilder().setTimestamp().setFooter({
        text: "Vote Closed",
        iconURL: client.user.displayAvatarURL(),
      });

      if (yesVotes > noVotes) {
        try {
          await targetMsg.delete();
          resultEmbed
            .setColor("#00b894")
            .setTitle(`${FIRE} **Message Purged**`)
            .setDescription(
              `### ${CHECK} **Community Decision: DELETE**\n` +
                `${ARROW} **Yes:** \`${yesVotes}\` votes\n` +
                `${ARROW} **No:** \`${noVotes}\` (Owner + \`${noVotes - 1}\`) votes\n\n` +
                `*The message has been successfully removed.*`,
            );
        } catch (err) {
          resultEmbed
            .setColor("#d63031")
            .setTitle(`❌ **Deletion Failed**`)
            .setDescription(`Voted to delete, but I lack permissions.`);
        }
      } else {
        const reason = yesVotes === noVotes ? "TIE" : "REJECTED";
        resultEmbed
          .setColor("#d63031")
          .setTitle(`${TIME} **Message Retained**`)
          .setDescription(
            `### ${CROSS} **Community Decision: KEEP**\n` +
              `${ARROW} **Yes:** \`${yesVotes}\` votes\n` +
              `${ARROW} **No:** \`${noVotes}\` (Owner + \`${noVotes - 1}\`) votes\n\n` +
              `*Reason: ${reason}.*`,
          );
      }

      await response.edit({ embeds: [resultEmbed] }).catch(() => {});
      await response.reactions.removeAll().catch(() => {});
      setTimeout(() => response.delete().catch(() => {}), 10000);
    });
  },
};
