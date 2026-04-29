const axios = require("axios");
const { resolveEmoji } = require("../../utils/emoji-helper");
const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

const { startDownload } = require("./callbacks");

async function runPixivFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Pixiv", "Looking for the art...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "Pixiv", "Looking for the art...");
  }

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

    const LEA = getEmoji("lea", "getEmoji('ping_green', '✅')");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#fd79a8")
      .setTitle(`${NOTIF} **Pixiv Info Found**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} *Artwork Found*\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Artist:** *${author}*\n` +
          `${ARROW} **Type:** *${isUgoira ? "Ugoku-Illust (MP4)" : `Gallery (${imageProxyUrls.length} Pages)`}*\n\n` +
          `*Found via Pixiv Downloader*`,
      );

    if (options.isCommand && options.type) {
      return await startDownload(
        target,
        jobId,
        isUgoira ? "pixiv_ugoira" : "pixiv_gallery",
        { statusMsg },
      );
    }

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, isUgoira, statusMsg: resMsg };
  } catch (e) {
    console.error("[PIXIV-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [
        getStatusEmbed(
          target.guild,
          "Pixiv Download Failed",
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
