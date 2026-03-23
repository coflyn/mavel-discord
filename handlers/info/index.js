const { EmbedBuilder, MessageFlags, ChannelType } = require("discord.js");

module.exports = async function infoHandler(interaction) {
  const { commandName } = interaction;

  const guildEmojis = await interaction.guild.emojis.fetch();
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const EMOJIS = {
    GENERAL: getEmoji("purple_fire", "📋"),
    TIME: getEmoji("notif", "⏳"),
    ROLES: getEmoji("crowncyan", "🎨"),
    ARROW: getEmoji("arrow", ">"),
    SERVER: getEmoji("notif", "🏢"),
    BOOST: getEmoji("boost", "🚀"),
    PERSONNEL: getEmoji("diamond", "👥"),
    ASSETS: getEmoji("pc", "📂"),
    CHANNELS: getEmoji("coin", "📁"),
  };

  if (commandName === "info") {
    return handleUserInfo(interaction, EMOJIS);
  } else if (commandName === "server") {
    return handleServerInfo(interaction, EMOJIS);
  } else if (commandName === "icon") {
    return handleIconLogic(interaction);
  } else if (commandName === "banner") {
    return handleBannerLogic(interaction);
  }
};

async function handleUserInfo(interaction, EMOJIS) {
  const targetUser = interaction.options?.getUser("target") || interaction.user;
  const user = await targetUser.fetch();
  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  const banner = user.bannerURL({ dynamic: true, size: 1024 });

  const embed = new EmbedBuilder()
    .setColor(user.hexAccentColor || "#dcdade")
    .setAuthor({
      name: `User Profile`,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    })
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
    .setDescription(
      `### ${EMOJIS.GENERAL} **General Information**\n` +
        `${EMOJIS.ARROW} **Global Name:** ${user.globalName || "None"}\n` +
        `${EMOJIS.ARROW} **Mention:** ${user.toString()}\n` +
        `${EMOJIS.ARROW} **Username:** \`${user.username}\`\n` +
        `${EMOJIS.ARROW} **ID:** \`${user.id}\``,
    )
    .addFields({
      name: `${EMOJIS.TIME} **Timestamps**`,
      value:
        `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:f> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)\n` +
        `**Joined:** ${member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:f> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)` : "Not in server"}`,
      inline: false,
    });

  if (banner) embed.setImage(banner);

  if (member && member.roles.cache.size > 1) {
    const roles = member.roles.cache
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString())
      .slice(0, 15);

    const rolesCount = member.roles.cache.size - 1;
    embed.addFields({
      name: `${EMOJIS.ROLES} **Roles [${rolesCount}]**`,
      value:
        roles.join(" ") +
        (rolesCount > 15 ? ` ...and ${rolesCount - 15} more` : ""),
      inline: false,
    });

    if (member.displayHexColor !== "#000000") {
      embed.setColor(member.displayHexColor);
    }
  }

  const res = await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
    withResponse: true,
  });

  const reply = res?.resource || res;
  if (reply && reply.delete) {
    setTimeout(() => {
      if (interaction.isChatInputCommand?.()) {
        interaction.deleteReply().catch(() => {});
      } else {
        reply.delete().catch(() => {});
      }
    }, 60000);
  }
}

async function handleIconLogic(interaction) {
  const targetUser = interaction.options?.getUser("target");
  const { guild } = interaction;

  if (targetUser) {
    const avatarUrl = targetUser.displayAvatarURL({
      dynamic: true,
      size: 1024,
    });
    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`*Biometric Extract: ${targetUser.username}*`)
      .setDescription(`[Download Original File](${avatarUrl})`)
      .setImage(avatarUrl);

    const res = await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);
    return res;
  } else {
    const iconUrl = guild.iconURL({ dynamic: true, size: 1024 });
    if (!iconUrl)
      return interaction.reply({
        content: "*No icon detected for this Base.*",
        flags: [64],
      });

    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`*Base Identity: ${guild.name}*`)
      .setDescription(`[Download Original File](${iconUrl})`)
      .setImage(iconUrl);

    const res = await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);
    return res;
  }
}

async function handleBannerLogic(interaction) {
  const targetUser = interaction.options?.getUser("target");
  const { guild } = interaction;

  if (targetUser) {
    const user = await targetUser.fetch();
    const bannerUrl = user.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerUrl)
      return interaction.reply({
        content: "*Target user has no detectable profile banner.*",
        flags: [64],
      });

    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`*Visual Data: ${user.username}*`)
      .setDescription(`[Download Original File](${bannerUrl})`)
      .setImage(bannerUrl);

    const res = await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);
    return res;
  } else {
    const bannerUrl = guild.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerUrl)
      return interaction.reply({
        content: "*This server has no banner asset detected.*",
        flags: [64],
      });

    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`*Base Visual: ${guild.name}*`)
      .setDescription(`[Download Original File](${bannerUrl})`)
      .setImage(bannerUrl);

    const res = await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);
    return res;
  }
}

async function handleServerInfo(interaction, EMOJIS) {
  const { guild } = interaction;
  const owner = await guild.fetchOwner();

  const embed = new EmbedBuilder()
    .setColor("#00008b")
    .setAuthor({
      name: "Operational Base Registry",
      iconURL: guild.iconURL({ dynamic: true }),
    })
    .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
    .setDescription(
      `### ${EMOJIS.SERVER} **Operational Overview**\n` +
        `${EMOJIS.ARROW} **Name:** ${guild.name}\n` +
        `${EMOJIS.ARROW} **Owner:** ${owner.user.toString()}\n` +
        `${EMOJIS.ARROW} **ID:** \`${guild.id}\`\n` +
        `${EMOJIS.ARROW} **Verification:** ${guild.verificationLevel}\n` +
        `${EMOJIS.ARROW} **Region:** ${guild.preferredLocale}`,
    )
    .addFields(
      {
        name: `${EMOJIS.BOOST} **Boost Status**`,
        value:
          `${EMOJIS.ARROW} **Level:** ${guild.premiumTier}\n` +
          `${EMOJIS.ARROW} **Boosts:** ${guild.premiumSubscriptionCount || 0}`,
        inline: false,
      },
      {
        name: `${EMOJIS.PERSONNEL} **Personnel**`,
        value:
          `${EMOJIS.ARROW} **Total:** ${guild.memberCount}\n` +
          `${EMOJIS.ARROW} **Roles:** ${guild.roles.cache.size}`,
        inline: false,
      },
      {
        name: `${EMOJIS.ASSETS} **Assets**`,
        value:
          `${EMOJIS.ARROW} **Emojis:** ${guild.emojis.cache.size}\n` +
          `${EMOJIS.ARROW} **Stickers:** ${guild.stickers.cache.size}`,
        inline: false,
      },
      {
        name: `${EMOJIS.CHANNELS} **Channels**`,
        value:
          `${EMOJIS.ARROW} **Total:** ${guild.channels.cache.size}\n` +
          `${EMOJIS.ARROW} **Text:** ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size}\n` +
          `${EMOJIS.ARROW} **Voice:** ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size}`,
        inline: false,
      },
    )
    .setTimestamp();

  if (guild.bannerURL({ size: 1024 })) {
    embed.setImage(guild.bannerURL({ dynamic: true, size: 1024 }));
  }

  const res = await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
    withResponse: true,
  });

  const reply = res?.resource || res;
  if (reply && reply.delete) {
    setTimeout(() => {
      if (interaction.isChatInputCommand?.()) {
        interaction.deleteReply().catch(() => {});
      } else {
        reply.delete().catch(() => {});
      }
    }, 60000);
  }
}
