const { EmbedBuilder, MessageFlags } = require("discord.js");
const {
  scrapeInstagram,
  scrapeTikTok,
  scrapeYouTube,
  scrapeReddit,
  searchSocials,
} = require("../../utils/scrapers/social");
const { scrapeGitHub } = require("../../utils/scrapers/web");
const colors = require("../../utils/embed-colors");
const { resolveEmoji } = require("../../utils/emoji-helper");

const { REQUIRED_EMOJIS } = require("../../utils/emoji-registry");

async function harvestHandler(interaction) {
  const target = interaction.options.getString("target");
  const query = interaction.options.getString("query");

  const getEmoji = (name, fallback) =>
    resolveEmoji(interaction.guild, name, fallback);

  const FIRE = getEmoji("purple_fire", "🔥");
  const ARROW = getEmoji("arrow", "»");
  const ANNO = getEmoji("anno", "📢");
  const DIAMOND = getEmoji("diamond", "💎");
  const BOOK = getEmoji("book", "📖");
  const PC = getEmoji("pc", "💻");
  const SEARCH = getEmoji("three_dots", "🔍");
  const CAMERA = getEmoji("camera", "📷");

  const botUser = await interaction.client.user.fetch();
  const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

  if (!target || !query) {
    const infoEmbed = new EmbedBuilder()
      .setColor(colors.INFO)
      .setAuthor({
        name: "MaveL Scanner",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${ANNO} **Scan Results**`)
      .setImage(botBanner)
      .setDescription(
        `*Deep scan and collect details from profiles, channels, and discussions across the web.*`,
      )
      .addFields(
        {
          name: `${CAMERA} **Social & Profiles**`,
          value: `${ARROW} *TikTok, Instagram, GitHub*`,
          inline: false,
        },
        {
          name: `${PC} **Video & Channels**`,
          value: `${ARROW} *YouTube*`,
          inline: false,
        },
        {
          name: `${BOOK} **Discussions**`,
          value: `${ARROW} *Reddit*`,
          inline: false,
        },
        {
          name: `${SEARCH} **Discovery Tools**`,
          value: `${ARROW} *Social Finder (Global Scan)*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    const reply = await interaction.reply({
      embeds: [infoEmbed],
      flags: [MessageFlags.Ephemeral],
    });

    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    return reply;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);

  try {
    if (target === "instagram") {
      const result = await scrapeInstagram(query);
      if (!result.success) {
        return interaction.editReply({
          content: `${getEmoji("ping_red", "🔴")} **Failed:** ${result.error}\n*Instagram is currently restricting connections, please try again later.*`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(colors.SOCIAL)
        .setAuthor({
          name: "MaveL Scanner",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **Instagram Profile Info**`)
        .setThumbnail(result.profilePic)
        .setImage(botBanner)
        .setDescription(
          `### ${FIRE} **Profile Harvest**\n` +
            `${ARROW} **User:** @${result.username}\n` +
            `${ARROW} **Name:** *${result.title || result.username}*\n` +
            `${ARROW} **Status:** *${result.isVerified ? `Verified ${getEmoji("ping_green", "✅")}` : "Standard"}${result.isPrivate ? " | Private 🔒" : ""}*\n\n` +
            `${DIAMOND} **Account Statistics**\n` +
            `${ARROW} **Followers:** *${result.followers}*\n` +
            `${ARROW} **Following:** *${result.following}*\n` +
            `${ARROW} **Posts:** *${result.posts}*\n\n` +
            `${PC} **Biography**\n` +
            `*${result.bio || "No bio available."}*`,
        )
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (target === "tiktok") {
      const result = await scrapeTikTok(query);
      if (!result.success) {
        return interaction.editReply({
          content: `${getEmoji("ping_red", "🔴")} **Failed:** ${result.error}`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(colors.SOCIAL)
        .setAuthor({
          name: "MaveL Scanner",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **TikTok Profile Info**`)
        .setThumbnail(result.profilePic)
        .setImage(botBanner)
        .setDescription(
          `### ${FIRE} **Profile Harvest**\n` +
            `${ARROW} **User:** @${result.username}\n` +
            `${ARROW} **Nick:** *${result.nickname || "N/A"}*\n` +
            `${ARROW} **Region:** *${result.region}*\n` +
            `${ARROW} **Status:** *${result.isVerified ? `Verified ${getEmoji("ping_green", "✅")}` : "Standard"}*\n\n` +
            `${DIAMOND} **Interaction**\n` +
            `${ARROW} **Followers:** *${result.followers}*\n` +
            `${ARROW} **Following:** *${result.following}*\n` +
            `${ARROW} **Total Likes:** *${result.likes}*\n` +
            `${ARROW} **Total Videos:** *${result.videos}*\n\n` +
            `${PC} **Biography**\n` +
            `*${result.bio || "No bio available."}*`,
        )
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (target === "youtube") {
      const result = await scrapeYouTube(query);
      if (!result.success) {
        return interaction.editReply({
          content: `${getEmoji("ping_red", "🔴")} **Failed:** ${result.error}`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(colors.MUSIC_DL)
        .setAuthor({
          name: "MaveL Scanner",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **YouTube Channel/Video Info**`)
        .setThumbnail(result.thumbnail)
        .setImage(botBanner)
        .setDescription(
          `### ${FIRE} **Content Details**\n` +
            `${ARROW} **Title:** *${result.title}*\n` +
            `${ARROW} **Channel:** *${result.channel}*\n\n` +
            `${BOOK} **Description**\n` +
            `*${result.description || "No description available."}*`,
        )
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (target === "github") {
      const result = await scrapeGitHub(query);
      if (!result.success) {
        return interaction.editReply({
          content: `${getEmoji("ping_red", "🔴")} **Failed:** ${result.error}`,
        });
      }

      let repoList = "";
      if (result.topRepos && result.topRepos.length > 0) {
        repoList = `\n📂 **Popular Projects**\n`;
        result.topRepos.forEach((r) => {
          repoList += `${ARROW} [${r.name}](<${r.url}>) • ${r.stars} ⭐ (${r.language})\n`;
        });
      }

      const embed = new EmbedBuilder()
        .setColor(colors.DOCUMENT)
        .setAuthor({
          name: "MaveL Scanner",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **GitHub Profile Info**`)
        .setThumbnail(result.avatar)
        .setImage(botBanner)
        .setDescription(
          `### ${FIRE} **Profile Harvest**\n` +
            `${ARROW} **Name:** *${result.name}* (@${result.username})\n` +
            `${ARROW} **Total Repos:** *${result.repos}*\n` +
            `${ARROW} **Joined:** *${result.created}*\n\n` +
            `${DIAMOND} **Network**\n` +
            `${ARROW} **Followers:** *${result.followers}*\n` +
            `${ARROW} **Following:** *${result.following}*\n\n` +
            `${PC} **Biography**\n` +
            `*${result.bio || "No bio available."}*` +
            repoList,
        )
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (target === "reddit") {
      const result = await scrapeReddit(query);
      if (!result.success) {
        return interaction.editReply({
          content: `${getEmoji("ping_red", "🔴")} **Failed:** ${result.error}`,
        });
      }

      if (result.posts.length === 0) {
        return interaction.editReply({
          content: `🔘 No Reddit posts found for "${query}".`,
        });
      }

      let report = result.posts
        .map(
          (p, i) =>
            `**${i + 1}. [${p.title}](<${p.link}>)**\n` +
            `   ${ARROW} Votes: ${p.ups} | Comments: ${p.comments}`,
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(colors.ADMIN)
        .setAuthor({
          name: "MaveL Scanner",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **Reddit Results: ${query}**`)
        .setImage(botBanner)
        .setDescription(`### ${FIRE} **Top Discussions**\n` + report)
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (target === "find") {
      const result = await searchSocials(query);
      let report = result.results
        .map((p) => {
          const found = p.status === "Found";
          return `${found ? getEmoji("ping_green", "✅") : getEmoji("ping_red", "🔴")} **${p.name}**: ${found ? `[Link](${p.url})` : `*${p.status}*`}`;
        })
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(colors.SEARCH)
        .setAuthor({
          name: "MaveL Finder System",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${ANNO} **Social Scan: @${result.username}**`)
        .setImage(botBanner)
        .setDescription(`### ${DIAMOND} **Digital Footprints**\n` + report)
        .setFooter({
          text: "MaveL",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`[HARVEST-HANDLER] Error:`, err.message);
    await interaction
      .editReply({
        content: `${getEmoji("ping_red", "🔴")} **Something went wrong:** ${err.message}`,
      })
      .catch(() => {});
  }
}

module.exports = harvestHandler;
