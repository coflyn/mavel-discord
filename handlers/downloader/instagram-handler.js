const axios = require("axios");
const cheerio = require("cheerio");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

async function runInstagramFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");

  const FIRE = resolveEmoji(guild, "purple_fire", "🔥");
  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({ embeds: [getStatusEmbed(guild, "Instagram Link Found", "Getting post info...")] }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "Instagram Link Found", "Getting post info...");
  }

  try {
    const cleanUrl = url.includes("?") ? url.split("?")[0] : url;
    const isReel =
      cleanUrl.includes("/reel/") ||
      cleanUrl.includes("/reels/") ||
      cleanUrl.includes("/p/");
    let mediaUrl = null;
    let title = "Instagram Post";
    let author = "Anonymous User";
    let stats = {
      likes: "0",
      views: "0",
      comments: "0",
      shares: "0",
      duration: "---",
    };
    let thumbnail = "";
    let isVideo = false;
    let isMix = false;
    let allImages = [];
    let scrapeSuccess = false;
    let discoveryPath = "YT-DLP";

    let ytTarget = cleanUrl;
    if (isReel && !ytTarget.includes("/reels/")) {
      ytTarget = ytTarget.replace("/p/", "/reels/");
    }

    const { spawn } = require("child_process");
    const { getCookiesArgs, getYtDlp, getDlpEnv } = require("../../utils/dlp-helpers");

    const ytCheckData = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);
      const proc = spawn(getYtDlp(), [
        ...getCookiesArgs(),
        "--simulate",
        "--print", "%(webpage_url)s|%(_type)s|%(ext)s",
        "--add-header", "Referer:https://www.instagram.com/",
        ytTarget,
      ], { env: getDlpEnv() });
      let stdout = "";
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        const out = stdout.trim();
        if (code !== 0 || !out || out.includes("login") || out.length < 10)
          resolve(null);
        else resolve(out.split("\n")[0]);
      });
      proc.on("error", () => { clearTimeout(timeout); resolve(null); });
    });

    console.log(`[INSTA-FLOW] Phase 1 Raw: ${ytCheckData}`);
    const [ytUrl, ytType, ytExt] = (ytCheckData || "").split("|");
    const isYtPlaylist = ytType?.toLowerCase().includes("playlist");

    if (
      ytUrl &&
      !isYtPlaylist &&
      (ytExt === "mp4" || ytExt === "webm" || ytUrl.includes(".mp4") || ytUrl.includes(".m3u8"))
    ) {
      console.log("[INSTA-FLOW] Phase 1 Success: Video metadata confirmed.");
      isVideo = true;
      scrapeSuccess = true;
      discoveryPath = "YT-DLP";

      try {
        const meta = await new Promise((resolve) => {
          const metaProc = spawn(getYtDlp(), [
            ...getCookiesArgs(),
            "--simulate",
            "--print", "%(uploader)s|%(title)s|%(thumbnail)s|%(duration)s|%(like_count)s|%(comment_count)s|%(view_count)s",
            cleanUrl,
          ], { env: getDlpEnv() });
          let stdout = "";
          metaProc.stdout.on("data", (d) => { stdout += d.toString(); });
          metaProc.on("close", () => resolve(stdout.trim() || "||||||"));
          metaProc.on("error", () => resolve("||||||"));
        });
        const [u, t, thumb, dur, l, c, v] = meta.split("|");
        if (u && u !== "NA") author = u;
        if (t && t !== "NA") title = t;
        if (thumb && thumb !== "NA") thumbnail = thumb;
        if (dur && dur !== "NA") stats.duration = parseFloat(dur);
        if (l && l !== "NA") stats.likes = l;
        if (c && c !== "NA") stats.comments = c;
        if (v && v !== "NA") stats.views = v;
      } catch (e) {}
    }

    if (!scrapeSuccess) {
      let proxyPath = new URL(cleanUrl).pathname;
      if (isReel && !proxyPath.includes("/reels/")) {
        proxyPath = proxyPath.replace("/p/", "/reels/");
      }
      const proxyUrl = `https://ddinstagram.com${proxyPath}`;

      try {
        const res = await axios.get(proxyUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; TelegramBot/1.0; +https://core.telegram.org/bots/webhooks)",
          },
          timeout: 8000,
        });

        const $ = cheerio.load(res.data);

        const metaTitle =
          $('meta[property="og:title"]').attr("content") || author;
        author = metaTitle.split(" on Instagram")[0] || author;

        let rawDesc =
          $('meta[property="og:description"]').attr("content") || title;
        title = rawDesc.split("\n")[0].substring(0, 100).trim();

        const likesMatch = rawDesc.match(/([\d,K]+)\s*likes/i);
        const commentsMatch = rawDesc.match(/([\d,K]+)\s*comments/i);
        if (likesMatch) stats.likes = likesMatch[1];
        if (commentsMatch) stats.comments = commentsMatch[1];

        const directVideo =
          $('meta[property="og:video:secure_url"]').attr("content") ||
          $('meta[property="og:video:url"]').attr("content") ||
          $('meta[property="og:video"]').attr("content");

        for (let i = 1; i <= 10; i++) {
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

        const isReel = cleanUrl.includes("/reel/");
        isVideo = !!directVideo && (isReel || !fallbackImage);

        if (directVideo && allImages.length > 0) {
          isMix = true;
          isVideo = true;
        }

        mediaUrl = isVideo ? directVideo : allImages[0];
        thumbnail = allImages[0] || fallbackImage || "";

        if (mediaUrl) {
          scrapeSuccess = true;
          discoveryPath = isMix
            ? "Proxy (Mix Assets)"
            : isVideo
              ? "Proxy (Video)"
              : "Proxy (Photo/Gallery)";
        }
      } catch (e) {
        await _editResponse({
          embeds: [
            getStatusEmbed(guild, "Instagram Link Lost", "Starting the download..."),
          ],
        });

        let browser;
        try {
          const { chromium } = require("playwright");
          browser = await chromium.launch({ headless: true });
          const context = await browser.newContext({
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport: { width: 1280, height: 720 },
          });
          const page = await context.newPage();

          const embedUrl = cleanUrl.endsWith("/")
            ? cleanUrl + "embed/"
            : cleanUrl + "/embed/";
          await page.goto(embedUrl, {
            waitUntil: "networkidle",
            timeout: 35000,
          });

          await page
            .waitForSelector("video", { timeout: 10000 })
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));

          const pageData = await page.evaluate(async () => {
            const og = (p) =>
              document.querySelector(`meta[property="${p}"]`)?.content || "";

            const video =
              document.querySelector("video")?.src ||
              document.querySelector("video source")?.src ||
              og("og:video:secure_url") ||
              og("og:video");

            const duration = document.querySelector("video")?.duration || 0;

            const image =
              og("og:image:secure_url") ||
              og("og:image") ||
              document.querySelector(".EmbeddedMediaImage")?.src;
            const user =
              document.querySelector(".UsernameText")?.innerText ||
              document.title.split(" • ")[0];
            const text =
              document.querySelector(".CaptionText")?.innerText ||
              document.title;
            const description = og("og:description");

            const imgElements = Array.from(document.querySelectorAll("img"));
            let allImgs = imgElements
              .map((img) => ({
                src: img.src,
                w: img.naturalWidth || img.width,
                h: img.naturalHeight || img.height,
              }))
              .filter(
                (img) =>
                  img.w > 300 &&
                  img.src.includes("instagram.com") &&
                  !img.src.includes("profile"),
              )
              .sort((a, b) => b.w * b.h - a.w * a.h);

            const uniqueImgs = [...new Set(allImgs.map((i) => i.src))];

            const videoElements = Array.from(
              document.querySelectorAll("video"),
            );
            const allVideos = videoElements
              .map((v) => v.src || v.querySelector("source")?.src)
              .filter((v) => v && v.startsWith("http"));

            let internalVideos = [];
            let placeholderFound = false;
            const watchLink = Array.from(document.querySelectorAll("a")).find(
              (a) => a.href.includes("/reel/"),
            );
            if (watchLink) placeholderFound = true;

            try {
              const scripts = Array.from(document.querySelectorAll("script"));
              for (const s of scripts) {
                const m = s.innerText.match(/"video_url":"(https:\\[^"]+)"/g);
                if (m) {
                  m.forEach((match) => {
                    const urlMatch = match.match(
                      /"video_url":"(https:\\[^"]+)"/,
                    );
                    if (urlMatch)
                      internalVideos.push(urlMatch[1].replace(/\\u0026/g, "&"));
                  });
                }
              }
            } catch (e) {}

            try {
              for (let i = 0; i < 15; i++) {
                const nextBtn = document.querySelector(
                  'button[aria-label="Next"], button._afxw, button._al46',
                );
                if (!nextBtn || nextBtn.offsetParent === null) break;
                nextBtn.click();
                await new Promise((r) => setTimeout(r, 800));
              }
            } catch (e) {}

            const carouselImgs = Array.from(
              document.querySelectorAll(
                "ul li img, div._aagv img, img[srcset]",
              ),
            ).map((img) => img.src);
            const allFoundImgs = [
              ...new Set(uniqueImgs.concat(carouselImgs)),
            ].filter((s) => s && s.startsWith("http"));

            return {
              video:
                video || (internalVideos.length > 0 ? internalVideos[0] : ""),
              duration,
              image,
              user,
              text,
              description,
              placeholder: placeholderFound,
              allImages: allFoundImgs.slice(0, 25),
              allVideos: [...new Set(allVideos.concat(internalVideos))],
            };
          });

          if (pageData.video || pageData.image) {
            const rawDesc = pageData.description || "";
            const likesMatch = rawDesc.match(/([\d,K.]+)\s*(likes|suka)/i);
            const commentsMatch = rawDesc.match(
              /([\d,K.]+)\s*(comments|komentar)/i,
            );
            if (likesMatch) stats.likes = likesMatch[1];
            if (commentsMatch) stats.comments = commentsMatch[1];
            if (pageData.duration > 0 && stats.duration === "---")
              stats.duration = pageData.duration;

            const hasImages = pageData.allImages.length > 0;
            const hasVideos = pageData.video || pageData.allVideos.length > 0;
            if (hasVideos && pageData.allImages.length > 1) {
              isMix = true;
              isVideo = true;
              mediaUrl = pageData.video || pageData.allVideos[0];
              allImages = pageData.allImages;
              discoveryPath += " + Browser (Mix Gallery)";
            } else if (pageData.allImages.length > 1) {
              isMix = false;
              isVideo = false;
              allImages = pageData.allImages;
              mediaUrl = allImages[0];
              discoveryPath += " + Browser (Gallery)";
            } else if ((isReel || isVideo) && hasVideos) {
              isVideo = true;
              mediaUrl = pageData.video || pageData.allVideos[0] || mediaUrl;
              discoveryPath += pageData.placeholder
                ? " + Browser (Slow Mode)"
                : " + Browser (Deep Scan)";
            } else if (
              pageData.video &&
              (!pageData.video.includes("blob:") ||
                pageData.allImages.length === 0)
            ) {
              isVideo = true;
              mediaUrl = pageData.video;
              discoveryPath += " + Browser (Video Link)";
            } else {
              isVideo = false;
              mediaUrl = pageData.image || pageData.allImages[0];
              discoveryPath += " + Browser (Scan)";
            }

            if (!isVideo) {
              allImages = hasImages ? pageData.allImages : [pageData.image];
            } else if (!isMix) {
              allImages = [];
            }
            author = pageData.user || author;
            title = pageData.text || title;
            thumbnail = pageData.image || thumbnail;
            scrapeSuccess = true;
          }
          await browser.close();
        } catch (err) {
          if (browser) await browser.close();
          console.error("[INSTA-BROWSER-FAIL]", err.message);
        }
      }
    }

    if (!scrapeSuccess) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Download Failed",
            "Could not capture media resources from this link. Platform may be restricted or content is private.",
          ),
        ],
      });
      return null;
    }

    const jobId = Math.random().toString(36).substring(2, 10);
    const finalPlatform = isMix
      ? "Instagram (Mix)"
      : isVideo
        ? "Instagram (Video)"
        : allImages.length > 1
          ? "Instagram (Gallery)"
          : "Instagram (Photo)";

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: (title || "Instagram Post") + (author ? ` (@${author})` : ""),
      stats,
      thumbnail,
      platform: finalPlatform,
      userId: target.user ? target.user.id : target.author?.id || "unknown",
      isGallery: allImages.length > 1,
      hasVideo: isVideo,
      isVideo,
      isMix,
      discovery: discoveryPath,
      directUrl: isVideo && discoveryPath === "YT-DLP" ? null : mediaUrl,
      allImages,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const formatDuration = (s) => {
      if (!s || s === "---") return "---";
      const rs = Math.floor(s);
      const m = Math.floor(rs / 60);
      const ss = rs % 60;
      return `${m}:${ss.toString().padStart(2, "0")}`;
    };

    const foundEmbed = new EmbedBuilder()
      .setColor("#e17055")
      .setTitle(`${NOTIF} **Instagram Post Found**`)
      .setDescription(
        `### ${LEA} **Post Found**\n` +
          `${ARROW} **Author:** *${author}*\n` +
          `${ARROW} **Type:** *Instagram ${isMix ? "Mixed Files" : isVideo ? "Video/Reel" : allImages.length > 1 ? `Gallery (${allImages.length})` : "Photo"}*\n` +
          `${ARROW} **Title:** *${title || "Instagram Media"}*\n` +
          `${ARROW} **Length:** *${formatDuration(stats.duration)}*\n\n` +
          `**Post Info**\n` +
          `${ARROW} **Likes:** *${stats.likes || "0"}*\n` +
          `${ARROW} **Comments:** *${stats.comments || "0"}*\n` +
          `${ARROW} **Views:** *${stats.views || "0"}*\n\n` +
          `*Everything is ready. Starting the download...*`,
      );

    if (thumbnail && thumbnail.startsWith("http")) {
      foundEmbed.setThumbnail(thumbnail);
    }

    const row = new ActionRowBuilder();
    if (isVideo) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_mp4_${jobId}`)
          .setLabel("VIDEO (MP4)")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dl_mp3_${jobId}`)
          .setLabel("AUDIO (MP3)")
          .setStyle(ButtonStyle.Success),
      );
    } else if (allImages.length > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_twgallery_${jobId}`)
          .setLabel(`GALLERY (${allImages.length} PHOTOS)`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dl_mp3_${jobId}`)
          .setLabel("AUDIO (MP3)")
          .setStyle(ButtonStyle.Success),
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_photo_${jobId}`)
          .setLabel("PHOTO (JPG)")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dl_mp3_${jobId}`)
          .setLabel("AUDIO (MP3)")
          .setStyle(ButtonStyle.Success),
      );
    }

    const components = [row];

    if (options.isCommand && options.type) {
      const finalFormat =
        options.type === "mp3"
          ? "mp3"
          : isVideo
            ? "mp4"
            : allImages.length > 1
              ? "twgallery"
              : "photo";
      return await require("./callbacks").startDownload(
        target,
        jobId,
        finalFormat,
        { statusMsg },
      );
    }

    const resMsg = await _editResponse({
      embeds: [foundEmbed],
      components: options.isCommand ? components : [],
    });
    return {
      jobId,
      statusMsg: resMsg,
      isGallery: !isVideo && allImages.length > 1,
      isVideo,
    };
  } catch (e) {
    console.error("[INSTA-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runInstagramFlow };
