const { chromium } = require("playwright");
const { spawn } = require("child_process");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { loadDB, saveDB } = require("./core-helpers");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const {
  getChromiumResolverRules,
} = require("../../utils/dns-bypass");

async function runPSrvFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const SHIELD = getEmoji("shield", "🛡️");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  const isPornhub = url.includes("pornhub.com");
  const isXNXX = url.includes("xnxx.com");
  const isXVideos = url.includes("xvideos.com");
  const isEPorner = url.includes("eporner.com");

  let normalizedUrl = url;
  if (isPornhub) {
    normalizedUrl = url.replace(
      "interstitial?viewkey=",
      "view_video.php?viewkey=",
    );
    if (
      !normalizedUrl.includes("view_video.php") &&
      normalizedUrl.includes("viewkey=")
    ) {
      const vk = new URL(normalizedUrl).searchParams.get("viewkey");
      if (vk)
        normalizedUrl = `https://www.pornhub.com/view_video.php?viewkey=${vk}`;
    }
  }

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Deploying Proxy...",
      "Initializing secure connection...",
    );
  }

  if (isPornhub) {
    let browser;
    try {
      const resolverArgs = await getChromiumResolverRules(normalizedUrl);
      browser = await chromium.launch({
        headless: true,
        args: [...resolverArgs],
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      await context.addCookies([
        { name: "age_verified", value: "1", domain: ".pornhub.com", path: "/" },
        {
          name: "access_granted",
          value: "1",
          domain: ".pornhub.com",
          path: "/",
        },
      ]);

      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Analyzing Page...",
            "Securing bypass token...",
          ),
        ],
      });

      await page.goto(normalizedUrl, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      try {
        const enterBtn = page
          .locator(
            '.buttonOver18, a:has-text("ENTER"), button:has-text("ENTER")',
          )
          .first();
        if ((await enterBtn.count()) > 0) {
          await enterBtn.click({ force: true });
          await page.waitForTimeout(2000);
        }
      } catch (interErr) {}

      const isNotFound = await page.evaluate(() => {
        return (
          document.title.includes("Page Not Found") ||
          !!document.querySelector(".error-page, .error-message")
        );
      });
      if (isNotFound)
        throw new Error(
          "This video is no longer available (404 Page Not Found).",
        );

      const flashvars = await page.evaluate(() => {
        for (let key in window) {
          if (key.startsWith("flashvars_")) return window[key];
        }
        return window.flashvars || null;
      });

      if (!flashvars)
        throw new Error("The site is strictly blocking automated access.");

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

      await page.goto(gatewayUrl, { waitUntil: "networkidle", timeout: 30000 });
      const rawJson = await page.evaluate(() => document.body.innerText);

      let finalMediaData;
      try {
        finalMediaData = JSON.parse(rawJson);
      } catch (jsonErr) {
        throw new Error("Media resolving rejected by server.");
      }

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
      console.error("[PSRV-PH] Error:", e.message);
      if (browser) await browser.close();
      await _editResponse({
        embeds: [getStatusEmbed(guild, "Failed", `Details: ${e.message}`)],
      });
      return null;
    }
  } else {
    try {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Analyzing Shards...",
            "Syncing secure connection...",
          ),
        ],
      });

      const dlArgs = [
        ...getJsRuntimeArgs(),
        ...getCookiesArgs(),
        ...getVpsArgs(),
        "--dump-json",
        "--no-warnings",
        "--no-playlist",
        normalizedUrl,
      ];

      const proc = spawn(getYtDlp(), dlArgs, { env: getDlpEnv() });
      let stdout = "";
      proc.stdout.on("data", (d) => (stdout += d));

      const code = await new Promise((resolve) => proc.on("close", resolve));

      if (code !== 0 || !stdout.trim()) {
        throw new Error("Could not resolve media info.");
      }

      const json = JSON.parse(stdout.trim().split("\n")[0]);
      const title = json.title || "StreamSync Material";
      const uploader = json.uploader || "Anonymous";
      const thumbnail = json.thumbnail || "";
      const jobId = Math.random().toString(36).substring(2, 10);
      const platform = isXNXX
        ? "XNXX"
        : isXVideos
          ? "XVideos"
          : isEPorner
            ? "EPorner"
            : "Adult Content";

      const db = loadDB();
      db.jobs[jobId] = {
        url: normalizedUrl,
        timestamp: Date.now(),
        title,
        stats: {
          views: json.view_count || "0",
          duration:
            json.duration_string || `${Math.floor(json.duration / 60)}m`,
          uploader: uploader,
        },
        thumbnail,
        platform,
        userId: target.user ? target.user.id : target.author.id,
        isGallery: false,
        hasVideo: true,
        directUrl: null,
        referer: normalizedUrl,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          Referer: normalizedUrl,
        },
      };
      saveDB(db);

      const { startDownload } = require("./callbacks");
      return await startDownload(target, jobId, "mp4", { statusMsg });
    } catch (e) {
      console.error("[PSRV-GENERIC] Error:", e.message);
      await _editResponse({
        embeds: [getStatusEmbed(guild, "Failed", `Details: ${e.message}`)],
      });
      return null;
    }
  }
}

module.exports = { runPSrvFlow };
