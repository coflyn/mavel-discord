const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

const { startDownload } = require("./callbacks");

async function runPinterestFlow(target, url, options = {}) {
  let browser;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const ARCHIVE = getEmoji("camera", "📷");
  const NOTIF = getEmoji("notif", "🔔");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Pinterest", "Getting Pinterest Pin info...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "Pinterest", "Getting Pinterest Pin info...");
  }

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const pinData = await page.evaluate(() => {
      const stateScript = Array.from(document.querySelectorAll("script")).find(
        (s) => s.innerText.includes("__PINTEREST_APP_STATE__"),
      );
      let data = {};

      if (stateScript) {
        try {
          const jsonStr = stateScript.innerText
            .split("__PINTEREST_APP_STATE__ = ")[1]
            .split(";")[0];
          data = JSON.parse(jsonStr);
        } catch (e) {}
      }

      const video = document.querySelector("video");
      const img =
        document.querySelector('div[data-test-id="pin-closeup-image"] img') ||
        document.querySelector('img[src*="pinimg.com"]');

      return {
        title: document.title.replace(" | Pinterest", "").trim(),
        videoUrl: video ? video.src : null,
        imageUrl: img ? img.src : null,
        appData: data,
      };
    });

    await browser.close();

    let finalMediaUrl = null;
    let isVideo = false;

    try {
      const rawData = pinData.appData;

      const findVideo = (obj) => {
        if (!obj || typeof obj !== "object") return null;

        const v = obj.video_list || (obj.data && obj.data.video_list);
        if (v) {
          const best =
            v.V_720P || v.V_360P || v.V_HLSV4 || v.V_V720P || v.V_HLSV3_MOBILE;
          if (best?.url) return best.url;
        }

        if (obj.orig_gif_url) return obj.orig_gif_url;
        if (obj.images?.orig?.url && obj.images.orig.url.includes(".gif"))
          return obj.images.orig.url;
        if (
          typeof obj.url === "string" &&
          obj.url.includes(".gif") &&
          obj.url.includes("/originals/")
        )
          return obj.url;

        for (let key in obj) {
          const found = findVideo(obj[key]);
          if (found) return found;
        }
        return null;
      };

      const deepVideoUrl = findVideo(rawData.resources?.PinResource);
      if (deepVideoUrl) {
        finalMediaUrl = deepVideoUrl;
        isVideo = true;
      } else if (pinData.videoUrl && pinData.videoUrl.includes(".mp4")) {
        finalMediaUrl = pinData.videoUrl;
        isVideo = true;
      }
    } catch (e) {}

    if (!finalMediaUrl && pinData.imageUrl) {
      const originalBase = pinData.imageUrl
        .replace(/\/\d+x\//, "/originals/")
        .split("?")[0];

      if (
        pinData.title.toLowerCase().includes("gif") &&
        originalBase.endsWith(".jpg")
      ) {
        const gifCheck = originalBase.replace(".jpg", ".gif");
        try {
          finalMediaUrl = originalBase;
        } catch (e) {
          finalMediaUrl = originalBase;
        }
      } else {
        finalMediaUrl = originalBase;
      }
      isVideo = false;
    }

    if (!finalMediaUrl) {
      throw new Error("Could not find Pin or media file.");
    }

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const jobId = Math.random().toString(36).substring(2, 10);

    let ext = finalMediaUrl.split(".").pop().split("?")[0].toLowerCase();
    if (!ext || ext.length > 4) ext = isVideo ? "mp4" : "jpg";

    const isActuallyVideo = isVideo && (ext === "mp4" || ext === "m3u8");
    const localPath = path.join(tempDir, `pinterest_hd_${jobId}.${ext}`);

    if (isActuallyVideo) {
      const db = loadDB();
      db.jobs[jobId] = {
        url: url,
        timestamp: Date.now(),
        title: pinData.title || "Pinterest Pin",
        stats: { type: "HD Pin Video" },
        thumbnail:
          target.client?.user?.displayAvatarURL() ||
          "https://www.pinterest.com/favicon.ico",
        platform: "Pinterest",
        userId: target.user ? target.user.id : target.author.id,
        isGallery: false,
        imageUrls: [],
      };
      saveDB(db);

      if (options.isCommand && options.type) {
        return await startDownload(target, jobId, "mp4", { statusMsg });
      }

      return { jobId, statusMsg, isGallery: false };
    }

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Downloading HD Image/GIF",
          "Downloading Original High Quality File...",
        ),
      ],
    });

    const res = await axios.get(finalMediaUrl, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    fs.writeFileSync(localPath, res.data);

    const db = loadDB();
    db.jobs[jobId] = {
      url: url,
      timestamp: Date.now(),
      title: pinData.title || "Pinterest Pin",
      stats: { type: ext === "gif" ? "HD Pin GIF" : "HD Pin Image" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.pinterest.com/favicon.ico",
      platform: "Pinterest",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: [localPath],
    };
    saveDB(db);

    if (options.isCommand && options.type) {
      return await startDownload(target, jobId, "twgallery", { statusMsg });
    }

    return { jobId, statusMsg, isGallery: true };
  } catch (e) {
    if (browser) await browser.close();
    console.error(`[PINTEREST-FAIL] ${e.message}`);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Download Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runPinterestFlow };
