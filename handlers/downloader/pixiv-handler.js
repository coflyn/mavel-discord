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
const { createJob, createHandlerContext } = require("./core-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runPixivFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("Pixiv", "Looking for the art...");

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
    const jobId = createJob(target, {
      url,
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
      isGallery: !isUgoira && imageProxyUrls.length > 1,
      hasVideo: isUgoira,
      isVideo: isUgoira,
      extractor: "pixiv-api",
      pixivUrls: imageProxyUrls,
    });

    const botUser = await target.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.ARTWORK)
      .setTitle(`${NOTIF} **Pixiv Info Found**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} *Artwork Found*\n` +
          `${ctx.ARROW} **Title:** *${title}*\n` +
          `${ctx.ARROW} **Artist:** *${author}*\n` +
          `${ctx.ARROW} **Type:** *${isUgoira ? "Ugoku-Illust (MP4)" : `Gallery (${imageProxyUrls.length} Pages)`}*\n\n` +
          `*Found via Pixiv Downloader*`,
      );

    if (options.isCommand && options.type) {
      return await startDownload(
        target,
        jobId,
        isUgoira ? "pixiv_ugoira" : "pixiv_gallery",
        { statusMsg: ctx.statusMsg },
      );
    }

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, isUgoira, statusMsg: resMsg };
  } catch (e) {
    console.error("[PIXIV-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Pixiv Download Failed",
          e.message || "Could not reach Pixiv servers.",
        ),
      ],
    });
  }
}


module.exports = {
  runPixivFlow,
};
