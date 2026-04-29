const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runFacebookFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("Facebook", "Getting video info...");

  try {
    const ddFbUrl = url
      .replace("facebook.com", "ddfacebook.com")
      .replace("fb.com", "ddfacebook.com")
      .replace("www.", "")
      .split("?")[0];
    const res = await axios.get(ddFbUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(res.data);
    const videoUrl =
      $('meta[property="og:video:secure_url"]').attr("content") ||
      $('meta[property="og:video:url"]').attr("content") ||
      $('meta[property="og:video"]').attr("content");
    const imageUrl =
      $('meta[property="og:image:secure_url"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $('meta[property="og:image"]').attr("content");
    const rawTitle =
      $('meta[property="og:title"]').attr("content") || "Facebook Media";
    const rawDesc =
      $('meta[property="og:description"]').attr("content") || "No description";

    let title = rawDesc.trim();
    title = title
      .split("\n")[0]
      .replace(/\d+.*(tayangan|tanggapan|views|comments|likes).*/gi, "")
      .trim();

    const author = rawTitle || "Unknown FB User";

    let stats = {
      likes: "---",
      views: "---",
      comments: "---",
      shares: "---",
      duration: "---",
    };
    const viewsMatch = rawDesc.match(/(\d+\s*rb|jt|\d+)\s+tayangan/i);
    const likesMatch = rawDesc.match(/(\d+\s*rb|jt|\d+)\s+tanggapan/i);
    if (viewsMatch)
      stats.views = viewsMatch[1].replace(" rb", "K").replace(" jt", "M");
    if (likesMatch)
      stats.likes = likesMatch[1].replace(" rb", "K").replace(" jt", "M");

    if (!videoUrl && !imageUrl) throw new Error("Video source restricted.");

    const jobId = createJob(target, {
      url,
      title: title || author,
      stats: stats,
      thumbnail: imageUrl || "",
      platform: "Facebook",
      isGallery: false,
      hasVideo: !!videoUrl,
      isVideo: !!videoUrl,
      extractor: "facebook-scrape",
      directUrl: videoUrl || imageUrl,
    });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.SOCIAL)
      .setTitle(`${NOTIF} **Facebook Video Found**`)
      .setThumbnail(imageUrl || "")
      .setDescription(
        `### ${LEA} **File Found**\n` +
          `${ctx.ARROW} **Title:** *${title}*\n` +
          `${ctx.ARROW} **Type:** *${videoUrl ? "Video" : "Photo"}*\n` +
          `${ctx.ARROW} **Author:** *${author}*\n\n` +
          `*Everything is ready. Starting the download...*`,
      );

    if (options.isCommand && options.type) {
      const finalFormat = options.type === "mp3" ? "mp3" : videoUrl ? "mp4" : "photo";
      return await startDownload(target, jobId, finalFormat, { statusMsg });
    }

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    console.error("[FB-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runFacebookFlow };
