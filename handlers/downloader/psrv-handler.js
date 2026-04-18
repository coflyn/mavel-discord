const { chromium } = require("playwright");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { loadDB, saveDB } = require("./core-helpers");
const axios = require("axios");

async function runPSrvFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const SHIELD = getEmoji("shield", "🛡️");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Deploying Browser...",
      "Initializing secure connection...",
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await context.addCookies([
      { name: "age_verified", value: "1", domain: ".pornhub.com", path: "/" },
      { name: "access_granted", value: "1", domain: ".pornhub.com", path: "/" },
    ]);

    await _editResponse({
      embeds: [
        getStatusEmbed(guild, "Analyzing Page...", "Securing bypass token..."),
      ],
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const flashvars = await page.evaluate(() => {
      for (let key in window) {
        if (key.startsWith("flashvars_")) return window[key];
      }
      return window.flashvars || null;
    });

    if (!flashvars)
      throw new Error(
        "Metadata extraction failed. The site is strictly blocking automated access.",
      );

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Resolving Stream...",
          "Extracting direct media link...",
        ),
      ],
    });

    const mediaDefs = flashvars.mediaDefinitions;
    let gatewayUrl = null;

    if (Array.isArray(mediaDefs)) {
      const sorted = mediaDefs
        .filter((m) => m.videoUrl && m.videoUrl.includes("get_media"))
        .map((m) => ({ ...m, q: parseInt(m.quality) || 0 }))
        .sort((a, b) => b.q - a.q);
      const best = sorted.find((m) => m.q <= 720) || sorted[0];
      gatewayUrl = best?.videoUrl;
    }

    if (!gatewayUrl) throw new Error("No media gateway found.");
    if (gatewayUrl.startsWith("//")) gatewayUrl = "https:" + gatewayUrl;

    const finalMediaData = await page.evaluate(async (endpoint) => {
      const resp = await fetch(endpoint);
      return await resp.json();
    }, gatewayUrl);

    let videoUrl = null;
    let isHls = false;

    if (Array.isArray(finalMediaData)) {
      const mp4s = finalMediaData.filter((m) => m.format === "mp4");
      if (mp4s.length > 0) {
        const sorted = mp4s
          .map((m) => ({ ...m, q: parseInt(m.quality) || 0 }))
          .sort((a, b) => b.q - a.q);
        const best = sorted.find((m) => m.q <= 720) || sorted[0];
        videoUrl = best.videoUrl;
      }

      if (!videoUrl) {
        const hls = finalMediaData.find(
          (m) => m.format === "hls" || m.videoUrl.includes("m3u8"),
        );
        if (hls) {
          videoUrl = hls.videoUrl;
          isHls = true;
        }
      }
    }

    if (!videoUrl) throw new Error("Final stream resolving failed.");

    const title = flashvars.video_title || "StreamSync Material";
    const thumbnail = flashvars.image_url || "";

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title,
      stats: {
        views: flashvars.views || "0",
        duration: flashvars.video_duration || "",
        uploader: "StreamSync",
      },
      thumbnail,
      platform: "Pornhub",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: true,
      directUrl: videoUrl,
      isHls: isHls || videoUrl.includes(".m3u8"),
      referer: url,
      headers: {
        Cookie: "age_verified=1; access_granted=1; platform=pc",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    };
    saveDB(db);

    const { startDownload } = require("./callbacks");
    await browser.close();
    return await startDownload(target, jobId, "mp4", { statusMsg });
  } catch (e) {
    console.error("[PSRV-FLOW] Error:", e.message);
    if (browser) await browser.close();
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed", `Details: ${e.message}`)],
    });
    return null;
  }
}

module.exports = { runPSrvFlow };
