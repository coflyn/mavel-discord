const axios = require("axios");
const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runPixivFlow(target, url, options = {}) {
  let statusMsg = options.statusMsg;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#fd79a8")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "Pixiv Extraction",
    "Secure scan in progress...",
  );

  if (!statusMsg) {
    if (target.replied || target.deferred) {
      statusMsg = await target.editReply({
        embeds: [initialEmbed],
        withResponse: true,
      });
    } else if (target.isChatInputCommand && target.isChatInputCommand()) {
      statusMsg = await target.reply({
        embeds: [initialEmbed],
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });
    } else {
      statusMsg = target.reply
        ? await target.reply({ embeds: [initialEmbed], withResponse: true })
        : await target.channel.send({ embeds: [initialEmbed] });
    }
  } else {
    const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
    if (msg && msg.edit) await msg.edit({ embeds: [initialEmbed] }).catch(() => {});
  }

  const editResponse = async (data) => {
    try {
      const payload = typeof data === "string" ? { content: data } : data;
      if (target.editReply) {
        return await target.editReply(payload);
      } else {
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        return await msg.edit(payload);
      }
    } catch (e) {
      console.error("[PIXIV-EDIT] Error:", e.message);
    }
  };

  try {
    const illustIdMatch =
      url.match(/artworks\/(\d+)/) || url.match(/illust_id=(\d+)/);
    if (!illustIdMatch) throw new Error("Invalid Pixiv URL ID.");
    const illustId = illustIdMatch[1];

    const res = await axios.get(
      `https://www.phixiv.net/api/info?id=${illustId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
        timeout: 10000,
      },
    );

    if (res.data.error || !res.data.image_proxy_urls) {
      throw new Error("Artwork data secured/blocked.");
    }

    const illust = res.data;
    const title = illust.title || "Pixiv Artwork";
    const author = illust.author_name || "Unknown Author";
    const isUgoira = illust.is_ugoira;
    const imageProxyUrls = illust.image_proxy_urls;
    const thumbnail = imageProxyUrls[0];
    const jobId = Math.random().toString(36).substring(2, 10);

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: title + (author ? ` by ${author}` : ""),
      stats: {
        likes: "---",
        views: "---",
        comments: "---",
        shares: "---",
        duration: isUgoira ? "Animation" : "",
        uploader: author,
      },
      thumbnail,
      platform: "Pixiv",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: !isUgoira && imageProxyUrls.length > 1,
      hasVideo: isUgoira,
      extractor: "pixiv-api",
      pixivUrls: imageProxyUrls,
    };
    saveDB(db);

    const botUser = await target.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#fd79a8")
      .setTitle(`${NOTIF} **Pixiv Metadata Secured**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} *Artwork Identified*\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Artist:** *${author}*\n` +
          `${ARROW} **Type:** *${isUgoira ? "Ugoku-Illust (MP4)" : `Gallery (${imageProxyUrls.length} Pages)`}*\n\n` +
          `*Detected via Phixiv Proxy Engine*`,
      );

    const resMsg = await editResponse({ embeds: [foundEmbed] });
    return { jobId, isUgoira, statusMsg: resMsg };
  } catch (e) {
    console.error("[PIXIV-FLOW] Error:", e.message);
    await editResponse({
      embeds: [
        getStatusEmbed(
          "Pixiv Extraction Failed",
          e.message || "Could not reach Pixiv servers.",
        ),
      ],
    });
  }
}

async function handlePixivDownload(interaction, jobId, format) {
  const db = loadDB();
  const job = db.jobs[jobId];
  if (!job)
    return interaction.reply({
      content: "*Error: Request expired.*",
      ephemeral: true,
    });
}

module.exports = {
  runPixivFlow,
};
