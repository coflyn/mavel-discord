const http = require("../../utils/http");
const cheerio = require("cheerio");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");
const colors = require("../../utils/embed-colors");

async function runInstagramFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("Instagram Link Found", "Getting post info...");

  try {
    const cleanUrl = url.includes("?") ? url.split("?")[0] : url;
    const finalPlatform = "Instagram";
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

    const { spawn } = require("child_process");
    const {
      getCookiesArgs,
      getYtDlp,
      getDlpEnv,
    } = require("../../utils/dlp-helpers");

    const ytCheckData = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 15000);
      const proc = spawn(
        getYtDlp(),
        [
          ...getCookiesArgs(),
          "--simulate",
          "--dump-json",
          "--add-header",
          "Referer:https://www.instagram.com/",
          ytTarget,
        ],
        { env: getDlpEnv() },
      );
      let stdout = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.on("close", () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(stdout.trim());
          resolve(json);
        } catch (e) {
          resolve(null);
        }
      });
      proc.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });

    if (ytCheckData) {
      console.log(
        "[INSTA-FLOW] Phase 1 Success: Metadata extracted via YT-DLP.",
      );
      scrapeSuccess = true;
      discoveryPath = "YT-DLP";

      const entries =
        ytCheckData.entries || (ytCheckData._type === "playlist" ? [] : null);

      if (entries) {
        console.log(
          `[INSTA-FLOW] Detected potential playlist with ${entries.length} items. Fetching main ID...`,
        );
        scrapeSuccess = true;

        const mainShortcode = ytCheckData.id;
        const mainUploader = ytCheckData.uploader_id || ytCheckData.uploader;

        console.log(`[INSTA-FLOW] Filtering for Shortcode: ${mainShortcode}`);

        const filteredEntries = entries.filter((e) => {
          const entryId = e.id || "";
          const entryUrl = e.webpage_url || "";
          const entryUploader = e.uploader_id || e.uploader;

          const isMatch =
            (mainShortcode &&
              (entryId.includes(mainShortcode) ||
                entryUrl.includes(mainShortcode))) ||
            (!mainShortcode && entryUploader === mainUploader);

          return isMatch;
        });

        console.log(
          `[INSTA-FLOW] Filtered down to ${filteredEntries.length} items from ${entries.length}`,
        );

        if (filteredEntries.length > 1) {
          isMix = true;
          allImages = filteredEntries
            .map((e) => e.url || (e.thumbnails && e.thumbnails[0]?.url))
            .filter(Boolean);
          allImages = [...new Set(allImages)].filter(
            (img) =>
              (img.includes("cdninstagram.com") || img.includes("fbcdn.net")) &&
              !img.includes("profile"),
          );
          mediaUrl = filteredEntries[0].url || allImages[0];
        } else if (
          filteredEntries.length === 1 ||
          (filteredEntries.length === 0 && entries.length > 0)
        ) {
          const e = filteredEntries[0] || entries[0];
          title = e.title || ytCheckData.title || title;
          author = e.uploader || ytCheckData.uploader || author;
          mediaUrl =
            e.url || (e.thumbnails && e.thumbnails[0]?.url) || ytCheckData.url;
          isVideo = e.ext !== "jpg" && e.ext !== "png";
          allImages = [mediaUrl].filter(Boolean);
        } else {
          mediaUrl =
            ytCheckData.url ||
            (ytCheckData.thumbnails && ytCheckData.thumbnails[0]?.url);
          allImages = [mediaUrl].filter(Boolean);
        }

        title = ytCheckData.title || title;
        author = ytCheckData.uploader || ytCheckData.uploader_id || author;
      } else {
        title = ytCheckData.title || title;
        author = ytCheckData.uploader || ytCheckData.uploader_id || author;
        thumbnail = ytCheckData.thumbnail || "";

        if (ytCheckData.duration) stats.duration = ytCheckData.duration;
        if (ytCheckData.like_count)
          stats.likes = ytCheckData.like_count.toString();
        if (ytCheckData.comment_count)
          stats.comments = ytCheckData.comment_count.toString();
        if (ytCheckData.view_count)
          stats.views = ytCheckData.view_count.toString();

        const hasFormats =
          ytCheckData.formats && ytCheckData.formats.length > 0;
        const hasDirectUrl = !!ytCheckData.url;

        isVideo =
          (ytCheckData._type === "video" || hasFormats || hasDirectUrl) &&
          ytCheckData.ext !== "jpg" &&
          ytCheckData.ext !== "png";

        console.log(
          `[INSTA-FLOW] isVideo: ${isVideo}, hasFormats: ${hasFormats}, ext: ${ytCheckData.ext}`,
        );

        if (isVideo) {
          mediaUrl = ytCheckData.url || null;
        } else {
          if (ytCheckData.thumbnails && ytCheckData.thumbnails.length > 0) {
            const bestThumb = ytCheckData.thumbnails.sort(
              (a, b) => b.width * b.height - a.width * a.height,
            )[0];
            allImages = [bestThumb.url];
            mediaUrl = bestThumb.url;
          }
        }
      }
    }

    if (!scrapeSuccess) {
      let proxyPath = new URL(cleanUrl).pathname;
      if (isReel && !proxyPath.includes("/reels/")) {
        proxyPath = proxyPath.replace("/p/", "/reels/");
      }
      const proxyUrl = `https://ddinstagram.com${proxyPath}`;

      try {
        const res = await http.get(proxyUrl, {
          uaType: "bot",
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

        const isValidIgGroup = (url) =>
          url &&
          (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) &&
          !url.includes("profile") &&
          !url.includes("avatar");

        const tempImages = [];
        for (let i = 1; i <= 10; i++) {
          const img =
            $(`meta[property="og:image:${i}"]`).attr("content") ||
            $(`meta[name="twitter:image:${i}"]`).attr("content");
          if (img && isValidIgGroup(img)) tempImages.push(img);
        }

        const fallbackImage =
          $('meta[property="og:image:secure_url"]').attr("content") ||
          $('meta[property="og:image:url"]').attr("content") ||
          $('meta[property="og:image"]').attr("content") ||
          $('meta[name="twitter:image"]').attr("content") ||
          $('meta[name="twitter:image:src"]').attr("content");

        if (
          tempImages.length === 0 &&
          fallbackImage &&
          isValidIgGroup(fallbackImage)
        ) {
          tempImages.push(fallbackImage);
        }

        if (tempImages.length > 1) {
          const domainCounts = {};
          tempImages.forEach((img) => {
            try {
              const domain = new URL(img).hostname;
              domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            } catch (e) {}
          });
          const topDomain = Object.keys(domainCounts).sort(
            (a, b) => domainCounts[b] - domainCounts[a],
          )[0];
          allImages = tempImages.filter((img) => {
            try {
              return new URL(img).hostname === topDomain;
            } catch (e) {
              return false;
            }
          });
        } else {
          allImages = tempImages;
        }

        const isReelShort = cleanUrl.includes("/reel/");
        isVideo = !!directVideo && (isReelShort || !fallbackImage);

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
        await ctx.editResponse({
          embeds: [
            ctx.statusEmbed("Instagram Link Lost", "Starting the download..."),
          ],
        });

        let page;
        try {
          const { getPage } = require("../../utils/browser");
          page = await getPage({
            userAgent: http.getUserAgent("desktop"),
            viewport: { width: 1280, height: 720 },
          });

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
          if (page) await page.close();
        } catch (err) {
          if (page) await page.close();
          console.error("[INSTA-BROWSER-FAIL]", err.message);
        }
      }
    }

    if (!scrapeSuccess) {
      await ctx.editResponse({
        embeds: [
          ctx.statusEmbed(
            "Download Failed",
            "Could not capture media resources from this link. Platform may be restricted or content is private.",
          ),
        ],
      });
      return null;
    }

    const jobId = createJob(target, {
      url,
      title: (title || "Instagram Post") + (author ? ` (@${author})` : ""),
      stats,
      thumbnail,
      platform: finalPlatform,
      isGallery: allImages.length > 1,
      hasVideo: isVideo,
      isVideo,
      isMix,
      discovery: discoveryPath,
      directUrl: mediaUrl,
      allImages,
    });

    const CHECK = ctx.getEmoji("check", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const formatDuration = (s) => {
      if (!s || s === "---") return "---";
      const rs = Math.floor(s);
      const m = Math.floor(rs / 60);
      const ss = rs % 60;
      return `${m}:${ss.toString().padStart(2, "0")}`;
    };

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.SOCIAL)
      .setTitle(`${NOTIF} **Instagram Post Found**`)
      .setDescription(
        `### ${CHECK} **Post Found**\n` +
          `${ctx.ARROW} **Author:** *${author}*\n` +
          `${ctx.ARROW} **Type:** *Instagram ${isMix ? "Mixed Files" : isVideo ? "Video/Reel" : allImages.length > 1 ? `Gallery (${allImages.length})` : "Photo"}*\n` +
          `${ctx.ARROW} **Title:** *${title || "Instagram Media"}*\n` +
          `${ctx.ARROW} **Length:** *${formatDuration(stats.duration)}*\n\n` +
          `**Post Info**\n` +
          `${ctx.ARROW} **Likes:** *${stats.likes || "0"}*\n` +
          `${ctx.ARROW} **Comments:** *${stats.comments || "0"}*\n` +
          `${ctx.ARROW} **Views:** *${stats.views || "0"}*\n\n` +
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

    const finalFormat =
      options?.type === "mp3"
        ? "mp3"
        : isVideo
          ? "mp4"
          : allImages.length > 1
            ? "twgallery"
            : "photo";
    return await ctx.finalize(jobId, finalFormat, foundEmbed, {
      ...options,
      extraRet: { isGallery: !isVideo && allImages.length > 1, isVideo },
      components: options.isCommand ? components : [],
    });
  } catch (e) {
    console.error("[INSTA-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runInstagramFlow };
