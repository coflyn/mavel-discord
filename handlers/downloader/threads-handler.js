const http = require("../../utils/http");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runThreadsFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("Threads", "Getting post info...");

  try {
    const threadsBase = url.includes("/post/")
      ? `https://www.threads.net/t/${url.split("/post/")[1].split("?")[0]}/`
      : url.replace("threads.com", "threads.net").split("?")[0];

    let videoUrl, imageUrl, title, author;
    let stats = {
      likes: "---",
      views: "---",
      comments: "---",
      shares: "---",
      duration: "---",
    };

    const uas = [
      userAgents.get("desktop"),
      userAgents.get("mobile"),
      userAgents.get("bot"),
    ];

    let lastError = null;
    for (let i = 0; i < uas.length; i++) {
      if (videoUrl || imageUrl) break;
      const currentUA = uas[i];
      try {
        const res = await http.get(threadsBase, {
          headers: {
            "User-Agent": currentUA,
          },
          timeout: 10000,
        });

        if (res.data.includes("login_page") || res.data.includes("/login/")) {
          if (i === 0) {
            lastError =
              "Link is protected by security. Retrying...";
            continue;
          }
          throw new Error(
            "Link is protected by security. Login required.",
          );
        }

        const $ = cheerio.load(res.data);

        if (i === 0) {
          const scripts = $(
            'script[type="application/json"], script:not([src])',
          );
          scripts.each((idx, el) => {
            const text = $(el).html();
            if (
              text &&
              (text.includes("image_versions2") || text.includes("display_url"))
            ) {
              const imgMatch = text.match(
                /"(https:\/\/[^"]+?\/[^"]+?\.(?:jpg|webp|png)[^"]*?)"/,
              );
              if (imgMatch && !imgMatch[1].includes("vignette") && !imageUrl) {
                const potential = imgMatch[1].replace(/\\u0026/g, "&");
                if (potential.includes("scontent")) {
                  imageUrl = potential;
                }
              }
            }
          });
        }

        const fetchedVideo =
          $('meta[property="og:video:secure_url"]').attr("content") ||
          $('meta[property="og:video:url"]').attr("content") ||
          $('meta[property="og:video"]').attr("content");
        const fetchedImage =
          $('meta[property="og:image:secure_url"]').attr("content") ||
          $('meta[property="og:image:url"]').attr("content") ||
          $('meta[property="og:image"]').attr("content");

        if (fetchedVideo) videoUrl = fetchedVideo;
        if (!imageUrl && fetchedImage) imageUrl = fetchedImage;

        const rawTitle = $('meta[property="og:title"]').attr("content");
        const rawDesc = $('meta[property="og:description"]').attr("content");

        if (rawTitle) {
          author = rawTitle.split(" (")[0];
          title = rawDesc || rawTitle;
        }

        if (rawDesc) {
          const commentsMatch = rawDesc.match(/([\d.K]+)\s*(Replies|Balasan)/i);
          const likesMatch = rawDesc.match(
            /([\d.K]+)\s*(Suka|Likes|Reactions)/i,
          );
          if (commentsMatch) stats.comments = commentsMatch[1];
          if (likesMatch) stats.likes = likesMatch[1];
        }
      } catch (e) {
        lastError = e.message;
        console.log(
          `[THREADS-SCRAPE] Attempt ${i + 1} failed with UA "${currentUA}":`,
          e.message,
        );
        continue;
      }
    }

    if (!videoUrl && !imageUrl) {
      const errorEmbed = new EmbedBuilder()
        .setColor(colors.SOCIAL)
        .setTitle("🔒 Download Failed")
        .setDescription(
          `*Security settings blocked the download: ${lastError || "Connection Lost"}*`,
        );
      await ctx.editResponse({ embeds: [errorEmbed] });
      return { jobId: null, statusMsg: ctx.statusMsg };
    }

    let displayTitle = (title || "Threads Post").split("\n")[0].trim();
    displayTitle = displayTitle
      .replace(/[\d.K]+\s*(Replies|Balasan|Likes|Suka).*/gi, "")
      .replace(/See more photos and videos.*/gi, "")
      .trim();

    if (!displayTitle || displayTitle.length < 2) {
      displayTitle = author ? `${author}'s Post` : "Threads Media";
    }

    if (displayTitle.length > 80)
      displayTitle = displayTitle.substring(0, 77) + "...";

    const jobId = createJob(target, {
      url: threadsBase,
      title: displayTitle + (author ? ` (@${author})` : ""),
      stats,
      thumbnail: imageUrl || "",
      platform: "Threads",
      isGallery: false,
      hasVideo: !!videoUrl,
      isVideo: !!videoUrl,
      extractor: "threads-scrape",
      directUrl: videoUrl || imageUrl,
    });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.SOCIAL)
      .setTitle(`${NOTIF} **Threads Post Found**`)
      .setThumbnail(imageUrl || "")
      .setDescription(
        `### ${LEA} **Media Found**\n` +
          `${ctx.ARROW} **Title:** *${displayTitle}*\n` +
          `${ctx.ARROW} **Type:** *${videoUrl ? "Video" : "Photo"}*\n` +
          `${ctx.ARROW} **Author:** *${author || "Threads User"}*\n\n` +
          `*Everything is ready. Starting the download...*`,
      );

    if (options.isCommand && options.type) {
      const finalFormat = options.type === "mp3" ? "mp3" : videoUrl ? "mp4" : "photo";
      return await startDownload(target, jobId, finalFormat, { statusMsg });
    }

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    console.error("[THREADS-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runThreadsFlow };
