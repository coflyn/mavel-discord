const http = require("../../utils/http");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

function formatDuration(seconds) {
  if (!seconds || seconds === "---") return "---";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const { startDownload } = require("./callbacks");

async function runTwitterFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("X / Twitter", "Searching for media...");

  try {
    const statusIdMatch = url.match(/status\/(\d+)/);
    if (!statusIdMatch) throw new Error("Invalid X/Twitter URL ID.");
    const statusId = statusIdMatch[1];

    let mediaUrl = null;
    let title = "X/Twitter Post";
    let author = "Anonymous";
    let stats = { likes: 0, views: 0, comments: 0, shares: 0, duration: "---" };
    let thumbnail = "";
    let isVideo = false;
    let allImages = [];
    let scrapeSuccess = false;

    const { spawn } = require("child_process");
    const { getCookiesArgs, getYtDlp, getDlpEnv } = require("../../utils/dlp-helpers");
const colors = require("../../utils/embed-colors");

    try {
      const ytTarget = url;
      const ytCheck = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 12000);
        const proc = spawn(getYtDlp(), [
          ...getCookiesArgs("twitter"),
          "--simulate", "--get-url",
          "--format", "bestvideo+bestaudio/best",
          "--add-header", `User-Agent:${userAgents.get("desktop")}`,
          ytTarget,
        ], { env: getDlpEnv() });
        let stdout = "";
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.on("close", (code) => {
          clearTimeout(timeout);
          const out = stdout.trim();
          if (code === 0 && out && !out.includes("login") && out.length > 10)
            resolve(out.split("\n")[0]);
          else resolve(null);
        });
        proc.on("error", () => { clearTimeout(timeout); resolve(null); });
      });

      if (
        ytCheck &&
        (ytCheck.includes(".mp4") ||
          ytCheck.includes(".m3u8") ||
          ytCheck.includes("video") ||
          ytCheck.includes("twimg.com/video"))
      ) {
        mediaUrl = ytCheck;
        isVideo = true;
        scrapeSuccess = true;

        const meta = await new Promise((resolve) => {
          const metaProc = spawn(getYtDlp(), [
            ...getCookiesArgs("twitter"),
            "--simulate",
            "--print", "%(uploader)s|%(title)s|%(thumbnail)s|%(duration)s",
            ytTarget,
          ], { env: getDlpEnv() });
          let stdout = "";
          metaProc.stdout.on("data", (d) => { stdout += d.toString(); });
          metaProc.on("close", () => resolve(stdout.trim() || "|||"));
          metaProc.on("error", () => resolve("|||"));
        });
        const [u, t, thumb, dur] = meta.split("|");
        if (u && u !== "NA") author = u;
        if (t && t !== "NA") title = t;
        if (thumb && thumb !== "NA") thumbnail = thumb;
        if (dur && dur !== "NA")
          stats.duration = formatDuration(parseFloat(dur));
      }
    } catch (e) {}

    if (!scrapeSuccess) {
      const providers = ["fxtwitter.com", "vxtwitter.com", "fixupx.com"];
      for (const provider of providers) {
        if (scrapeSuccess) break;
        try {
          allImages = [];
          const apiRes = await http.get(
            `https://${provider}/status/${statusId}`,
            {
              timeout: 8000,
              uaType: "bot",
            },
          );
          const html = apiRes.data;
          const $ = cheerio.load(html);

          const metaTitle =
            $('meta[property="og:title"]').attr("content") || author;
          author = metaTitle.split(" (")[0] || author;
          let rawDesc =
            $('meta[property="og:description"]').attr("content") || title;
          if (rawDesc.match(/Quoting/i))
            rawDesc = rawDesc.split(/Quoting/i)[0].trim();
          title = rawDesc
            .replace(/&lt;br\s*\/?&gt;/gi, " ")
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<\/?[^>]+(>|$)/g, "")
            .replace(/https?:\/\/\S+/gi, "")
            .trim();
          if (title.length > 80) title = title.substring(0, 77) + "...";

          let statsText = $('p:contains("💬")').text() || "";
          if (!statsText) {
            try {
              const oembedLink =
                $('link[type="application/json+oembed"]').attr("href") || "";
              if (oembedLink) {
                const urlParams = new URLSearchParams(oembedLink.split("?")[1]);
                statsText = urlParams.get("text") || "";
              }
            } catch (e) {}
          }

          const getMeta = (tag) =>
            $(`meta[name="${tag}"], meta[property="${tag}"]`).attr("content") ||
            "";
          const labels = [
            getMeta("twitter:label1"),
            getMeta("twitter:label2"),
            getMeta("twitter:label3"),
            getMeta("twitter:label4"),
          ];
          const datas = [
            getMeta("twitter:data1"),
            getMeta("twitter:data2"),
            getMeta("twitter:data3"),
            getMeta("twitter:data4"),
          ];

          const metaStats = {};
          labels.forEach((label, idx) => {
            if (!label) return;
            const data = datas[idx];
            if (!data) return;
            const cleanData = data.replace(/,/g, "");
            if (label.match(/Like/i)) metaStats.likes = cleanData;
            if (label.match(/Retweet|Repost/i)) metaStats.shares = cleanData;
            if (label.match(/Reply|Comment/i)) metaStats.comments = cleanData;
            if (label.match(/View|Tayangan/i)) metaStats.views = cleanData;
          });

          const textForStats =
            (statsText && statsText.length > 5 ? statsText : rawDesc) || "";
          const getStatFromText = (pattern) => {
            const match = textForStats.match(pattern);
            if (!match) return null;
            for (let j = 1; j < match.length; j++) {
              if (match[j]) return match[j].replace(/,/g, "");
            }
            return null;
          };

          stats = {
            comments:
              metaStats.comments ||
              getStatFromText(
                /(?:💬|Replies|Comments|Balasan)\s*([\d,.K]+)|([\d,.K]+)\s*(?:💬|Replies|Comments|Balasan)/i,
              ) ||
              "0",
            shares:
              metaStats.shares ||
              getStatFromText(
                /(?:🔁|🔄|Retweets|Reposts|Shares)\s*([\d,.K]+)|([\d,.K]+)\s*(?:🔁|🔄|Retweets|Reposts|Shares)/i,
              ) ||
              "0",
            likes:
              metaStats.likes ||
              getStatFromText(
                /(?:❤️|♥️|Likes|Suka)\s*([\d,.K]+)|([\d,.K]+)\s*(?:❤️|♥️|Likes|Suka)/i,
              ) ||
              "0",
            views:
              metaStats.views ||
              getStatFromText(
                /(?:👁️|👀|Views|Tayangan)\s*([\d,.K]+)|([\d,.K]+)\s*(?:👁️|👀|Views|Tayangan)/i,
              ) ||
              "0",
            duration: "---",
          };

          const directVideo =
            $('meta[property="og:video:secure_url"]').attr("content") ||
            $('meta[property="og:video:url"]').attr("content") ||
            $('meta[property="og:video"]').attr("content") ||
            $('meta[name="twitter:player:stream"]').attr("content") ||
            $('meta[name="twitter:player"]').attr("content");

          for (let i = 1; i <= 4; i++) {
            const img =
              $(`meta[property="og:image:${i}"]`).attr("content") ||
              $(`meta[name="twitter:image:${i}"]`).attr("content");
            if (img) allImages.push(img);
          }

          const fallbackImage =
            $('meta[property="og:image:secure_url"]').attr("content") ||
            $('meta[property="og:image:url"]').attr("content") ||
            $('meta[property="og:image"]').attr("content") ||
            $('meta[name="twitter:image"]').attr("content") ||
            $('meta[name="twitter:image:src"]').attr("content");

          if (allImages.length === 0 && fallbackImage) {
            allImages.push(fallbackImage);
          }

          mediaUrl = directVideo || allImages[0];
          thumbnail = allImages[0] || "";
          isVideo = !!directVideo;

          if (mediaUrl) scrapeSuccess = true;
        } catch (e) {}
      }
    }

    if (!scrapeSuccess || !mediaUrl) {
      return null;
    }

    const jobId = createJob(target, {
      url,
      title: (title || "X Media") + (author ? ` (@${author})` : ""),
      stats,
      thumbnail,
      platform: isVideo
        ? "X / Twitter (Video)"
        : allImages.length > 1
          ? "X / Twitter (Gallery)"
          : "X / Twitter (Image)",
      isGallery: !isVideo && allImages.length > 1,
      hasVideo: isVideo,
      isVideo: isVideo,
      extractor: "fx-scrape",
      directUrl: mediaUrl,
      twUrls: allImages,
    });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.SOCIAL)
      .setTitle(`${NOTIF} **X Post Found**`)
      .setDescription(
        `### ${LEA} **Media Found**\n` +
          `${ctx.ARROW} **Author:** *${author}*\n` +
          `${ctx.ARROW} **Content:** *${title.length > 50 ? title.substring(0, 47) + "..." : title}*\n` +
          `${ctx.ARROW} **Type:** *X Video*\n\n` +
          `*Everything is ready. Starting the download...*`,
      );

    if (thumbnail && thumbnail.startsWith("http")) {
      foundEmbed.setThumbnail(thumbnail);
    }

    const finalFormat = options?.type === "mp3" ? "mp3" : isVideo ? "mp4" : allImages.length > 1 ? "twgallery" : "photo";
    return await ctx.finalize(jobId, finalFormat, foundEmbed, {...options,  extraRet: { isVideo: isVideo, isGallery: !isVideo && allImages.length > 1 }});
  } catch (e) {
    console.error("[TWITTER-FLOW] Critical Error:", e.message);
    return null;
  }
}

module.exports = { runTwitterFlow };
