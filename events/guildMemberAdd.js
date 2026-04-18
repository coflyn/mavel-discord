const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { generateWelcomeCard } = require("../utils/welcome-card");
const { advanceLog } = require("../utils/logger");
const config = require("../config");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    try {
      if (config.autoRoleId) {
        const role = member.guild.roles.cache.get(config.autoRoleId);
        if (role) {
          member.roles.add(role).catch((err) => {
            console.error(
              `[AUTO-ROLE-ERROR] Failed to add role to ${member.user.tag}:`,
              err.message,
            );
          });
        }
      }

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
        const E_TEMPLE = resolveEmoji(member.guild, "temple", "🏛️");
        const E_ARROW = resolveEmoji(member.guild, "arrow", "•");

        let cardBuffer = null;
        try {
          const botUser = await client.user.fetch();
          const bannerUrl =
            botUser.bannerURL({ size: 1024, extension: "png" }) ||
            botUser.avatarURL({ size: 1024, extension: "png" });

          cardBuffer = await generateWelcomeCard(
            bannerUrl,
            member.user.displayAvatarURL({ extension: "png", size: 512 }),
            member.user.username,
          );
        } catch (cardErr) {}

        const msgData = {
          content: `### ${E_TEMPLE} **Welcome to the ${member.guild.name}, ${member}!**\n${E_ARROW} You are our **#${member.guild.memberCount}** member. Glad to have you here!`,
        };

        if (cardBuffer) {
          msgData.files = [
            new AttachmentBuilder(cardBuffer, { name: "welcome.png" }),
          ];
        }

        await gateChannel.send(msgData).catch(() => {});
      }

      advanceLog(client, {
        type: "success",
        title: "Member Joined",
        activity: "Gateway",
        message: `${member.user.tag} has entered the hub`,
        user: `${member.user.id}`,
        extra: `Member Count: ${member.guild.memberCount}`,
      });
    } catch (e) {
      console.error("[MEMBER-ADD] Error:", e.message);
    }
  },
};
