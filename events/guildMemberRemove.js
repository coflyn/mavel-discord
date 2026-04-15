const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { generateGoodbyeCard } = require("../utils/welcome-card");
const { advanceLog } = require("../utils/logger");
const config = require("../config");

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    try {
      let gateChannel = member.guild.channels.cache.get(
        config.gatewayChannelId,
      );
      if (!gateChannel && config.gatewayChannelId) {
        gateChannel = await member.guild.channels
          .fetch(config.gatewayChannelId)
          .catch(() => null);
      }
      if (!gateChannel) {
        gateChannel = member.guild.channels.cache.find(
          (c) =>
            c.name.toLowerCase().includes("gateway") ||
            c.name.toLowerCase().includes("gateaway"),
        );
      }

      if (gateChannel) {
        const { resolveEmoji } = require("../utils/emoji-helper");
        const E_DEPART = resolveEmoji(member.guild, "depart", "🕊️");
        const E_ARROW = resolveEmoji(member.guild, "arrow", "•");

        const botUser = await client.user.fetch();
        const bannerUrl =
          botUser.bannerURL({ size: 1024, extension: "png" }) ||
          botUser.avatarURL({ size: 1024, extension: "png" });

        const avatarUrl =
          member.user.avatarURL({ extension: "png", size: 512 }) ||
          member.user.displayAvatarURL({ extension: "png", size: 512 }) ||
          client.user.defaultAvatarURL;

        const cardBuffer = await generateGoodbyeCard(
          bannerUrl,
          avatarUrl,
          member.user.username,
        );

        const msgData = {
          content: `**Farewell, ${member.user.username}** ${E_DEPART}\n${E_ARROW} We're sad to see you go. Wishing you the best on your journey ahead.`,
        };

        if (cardBuffer) {
          msgData.files = [
            new AttachmentBuilder(cardBuffer, { name: "goodbye.png" }),
          ];
        }

        await gateChannel.send(msgData).catch(() => {});

        // Note: This might fail if the user shares no other servers with the bot
        try {
          const dmData = {
            content: `**Farewell, ${member.user.username}** ${E_DEPART}\n${E_ARROW} We're sad to see you leave **${member.guild.name}**. Wishing you the best on your journey ahead! Hope we cross paths again.`,
          };
          if (cardBuffer) {
            dmData.files = [
              new AttachmentBuilder(cardBuffer, { name: "goodbye.png" }),
            ];
          }
          await member.user.send(dmData).catch(() => {
            // This is expected if it was the only shared server
          });
        } catch (dmErr) {}
      }

      advanceLog(client, {
        type: "info",
        title: "Member Left",
        activity: "Gateway",
        message: `${member.user.tag} has departed`,
        user: `${member.user.id}`,
      });

      // Update Server Stats
      const { updateServerStats } = require("../utils/stats-handler");
      updateServerStats(member.guild);
    } catch (e) {
      advanceLog(client, {
        type: "error",
        title: "Gateway Failure",
        activity: "Border Control",
        message: `Failed to send goodbye: ${e.message}`,
        user: `${member.user.tag}`,
      });
    }
  },
};
