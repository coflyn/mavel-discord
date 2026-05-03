const http = require("../../utils/http");

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

    const res = await http.get(
      `https://www.phixiv.net/api/info?id=${illustId}`,
      { timeout: 10000 }
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

    const CHECK = ctx.getEmoji("check", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.ARTWORK)
      .setTitle(`${NOTIF} **Pixiv Info Found**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${CHECK} *Artwork Found*\n` +
          `${ctx.ARROW} **Title:** *${title}*\n` +
          `${ctx.ARROW} **Artist:** *${author}*\n` +
          `${ctx.ARROW} **Type:** *${isUgoira ? "Ugoku-Illust (MP4)" : `Gallery (${imageProxyUrls.length} Pages)`}*\n\n` +
          `*Found via Pixiv Downloader*`,
      );

    return await ctx.finalize(jobId, isUgoira ? "pixiv_ugoira" : "pixiv_gallery", foundEmbed, { ...options, extraRet: { isUgoira }  });
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
