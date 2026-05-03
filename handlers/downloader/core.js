const { spawn } = require("child_process");
const colors = require("../../utils/embed-colors");
const fs = require("fs");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { createJob, formatNumber, advanceLog, loadDB, saveDB } = require("./core-helpers");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { startDownload } = require("./callbacks");
const { runPixivFlow } = require("./pixiv-handler");
const { runTikTokFlow } = require("./tiktok-handler");
const { runCloudFlow } = require("./cloud-handler");
const { runSpotifyFlow } = require("./spotify-handler");
const { runSlideshareFlow } = require("./slideshare-handler");
const { runTwitterFlow } = require("./twitter-handler");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { runThreadsFlow } = require("./threads-handler");
const { runFacebookFlow } = require("./facebook-handler");
const { runScribdFlow } = require("./scribd-handler");
const { runInstagramFlow } = require("./instagram-handler");
const { runBandcampFlow } = require("./bandcamp-handler");
const { runSoundcloudFlow } = require("./soundcloud-handler");
const { runYoutubeFlow } = require("./youtube-handler");
const { runYtmFlow } = require("./ytm-handler");
const { runAcademiaFlow } = require("./academia-handler");
const { runCalameoFlow } = require("./calameo-handler");
const { runDPlayerFlow } = require("./dplayer-handler");
const { runKomikuFlow } = require("./komiku-handler");
const { runNSrvFlow } = require("./nsrv-handler");
const { runPSrvFlow } = require("./psrv-handler");
const { runDSrvFlow } = require("./dsrv-handler");

const musicKeywords = [
  "music.youtube.com",
  "spotify.com",
  "soundcloud.com",
  "bandcamp.com",
];

async function runYtDlpFlow(target, url, options = {}) {
  let finalUrl = url.replace("threads.com", "threads.net");

  if (
    finalUrl.includes("tiktok.com") ||
    finalUrl.includes("twitter.com") ||
    finalUrl.includes("x.com")
  ) {
    finalUrl = finalUrl.split("?")[0].split("#")[0];
  }
  let statusMsg;

  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

  const ARROW = getEmoji("arrow", "•");
  const LEA = getEmoji("lea", "🛰️");
  const FIRE = getEmoji("purple_fire", "🔥");
  const CHECK = getEmoji("check", "✅");
  const E_ERROR = getEmoji("ping_red", "❌");

  const initialEmbed = getStatusEmbed(
    guild,
    "Checking link...",
    "Getting link info...",
  );
  statusMsg = await sendInitialStatus(
    target,
    "Checking link...",
    "Getting link info...",
  );

  await advanceLog(target.client, {
    title: "Link Detected",
    message: `Bot is processing a new link.`,
    user: (target.user || target.author || {}).tag || "Unknown",
    platform: "SCANNER",
    url: url,
  });

  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  const routeConfigs = [
    { m: ["pixiv.net"], h: runPixivFlow, f: r => r.isUgoira ? "pixiv_ugoira" : "pixiv_gallery", u: false },
    { m: ["tiktok.com"], h: runTikTokFlow, f: r => r.isGallery ? "tkgallery" : "tkmp4", u: false, opts: t => ({ isCommand: t.isChatInputCommand && t.isChatInputCommand() }), cond: t => !(t.isChatInputCommand && t.isChatInputCommand()) },
    { m: ["open.spotify.com"], h: runSpotifyFlow, f: () => "spmp3", u: false },
    { m: ["bandcamp.com"], h: runBandcampFlow, f: r => r.isAlbum ? "twgallery" : "mp3", u: false },
    { m: ["music.youtube.com"], h: runYtmFlow, f: () => "mp3", u: false },
    { m: ["youtube.com", "youtu.be"], h: runYoutubeFlow, f: (r, o) => o.type || "mp4", u: false },
    { m: ["mediafire.com", "drive.google.com", "mega.nz", "mega.co.nz"], h: runCloudFlow, u: false, dir: true },
    { m: ["instagram.com"], h: runInstagramFlow, f: r => r.isMix || r.isGallery ? "twgallery" : r.isVideo ? "mp4" : "photo", u: true },
    { m: ["twitter.com", "://x.com", "vxtwitter.com", "fixupx.com"], h: runTwitterFlow, f: r => r.isGallery ? "twgallery" : r.isVideo ? "mp4" : "photo", u: true },
    { m: ["threads.net", "threads.com"], h: runThreadsFlow, f: (r, o) => o.type || "mp4", u: true },
    { m: ["soundcloud.com"], h: runSoundcloudFlow, f: () => "mp3", u: true }
  ];

  for (const route of routeConfigs) {
    const targetUrl = route.u ? finalUrl : url;
    if (route.m.some((match) => targetUrl.includes(match))) {
      const extraOpts = route.opts ? route.opts(target) : {};
      if (route.dir) {
        return await route.h(target, targetUrl, { statusMsg, ...options, ...extraOpts });
      }
      const jobResult = await route.h(target, targetUrl, { statusMsg, ...options, ...extraOpts });
      const shouldProceed = route.cond ? route.cond(target) : true;
      if (shouldProceed && jobResult && jobResult.jobId) {
        return await startDownload(target, jobResult.jobId, route.f(jobResult, options), {
          statusMsg: jobResult.statusMsg,
          ...(route.ext || {})
        });
      }
      return null;
    }
  }

    if (finalUrl.includes("pinterest.com") || finalUrl.includes("pin.it")) {
    const isVideo = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      const checkProcess = spawn(
        getYtDlp(),
        ["--simulate", "--get-url", finalUrl],
        { env: getDlpEnv() },
      );
      let stdout = "";
      checkProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      checkProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0 || !stdout || stdout.trim() === "") resolve(false);
        else resolve(true);
      });
      checkProcess.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });

    if (isVideo) {
      const { generateJobId } = require("./core-helpers");
      let jobId = generateJobId();
      const meta = await new Promise((resolve) => {
        const metaProcess = spawn(
          getYtDlp(),
          [
            "--simulate",
            "--print",
            "%(duration)s|%(uploader)s|%(title)s",
            finalUrl,
          ],
          { env: getDlpEnv() },
        );
        let stdout = "";
        metaProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });
        metaProcess.on("close", (code) => {
          if (code !== 0 || !stdout) resolve("||");
          else resolve(stdout.trim());
        });
        metaProcess.on("error", () => resolve("||"));
      });
      const [dur, uploader, rawTitle] = meta.split("|");

      createJob(target, {
        jobId,
        url: finalUrl,
        title: (rawTitle && rawTitle !== "NA"
          ? rawTitle
          : "Pinterest Video"
        ).substring(0, 100),
        stats: {
          likes: "0",
          views: "0",
          comments: "0",
          shares: "0",
          duration: dur && dur !== "NA" ? parseFloat(dur) : "",
          uploader: uploader && uploader !== "NA" ? uploader : "Pinterest",
        },
        thumbnail: "",
        platform: "Pinterest",
        isGallery: false,
        hasVideo: true,
        isVideo: true,
        extractor: "pinterest",
        directUrl: null,
      });
      return await startDownload(target, jobId, "mp4", { statusMsg });
    }

    const jobResult = await require("./pinterest-handler").runPinterestFlow(
      target,
      finalUrl,
      { statusMsg },
    );
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  const postRouteConfigs = [
    { m: ["facebook.com", "fb.watch", "fb.com"], h: require("./facebook-handler").runFacebookFlow, f: (r, o) => o.type || "mp4" },
    { m: ["slideshare.net"], h: require("./slideshare-handler").runSlideshareFlow, f: () => "twgallery" },
    { m: ["scribd.com"], h: runScribdFlow, f: () => "twgallery" },
    { m: ["academia.edu"], h: runAcademiaFlow, f: () => "twgallery" },
    { m: ["calameo.com"], h: runCalameoFlow, f: () => "twgallery" },
    { m: ["komiku.id", "komiku.com", "komiku.org"], h: runKomikuFlow, f: () => "twgallery" },
    { m: ["docplayer", "dplayer"], h: runDPlayerFlow, f: () => "cloud" },
    { m: ["nhentai.net", "cin.mom"], h: runNSrvFlow, f: () => "twgallery", ext: { platform: "Signal Archive" } },
    { m: ["pornhub.com", "xnxx.com", "xvideos.com", "eporner.com"], h: runPSrvFlow, dir: true },
    { m: ["doujindesu.tv"], h: runDSrvFlow, f: () => "twgallery", ext: { platform: "Proxy Sync" } }
  ];

  for (const route of postRouteConfigs) {
    if (route.m.some((match) => finalUrl.includes(match))) {
      const extraOpts = route.opts ? route.opts(target) : {};
      if (route.dir) {
        return await route.h(target, finalUrl, { statusMsg, ...options, ...extraOpts });
      }
      const jobResult = await route.h(target, finalUrl, { statusMsg, ...options, ...extraOpts });
      const shouldProceed = route.cond ? route.cond(target) : true;
      if (shouldProceed && jobResult && jobResult.jobId) {
        return await startDownload(target, jobResult.jobId, route.f(jobResult, options), {
          statusMsg: jobResult.statusMsg,
          ...(route.ext || {})
        });
      }
      return null;
    }
  }

  const referer = finalUrl.includes("capcut.com")
    ? "https://www.capcut.com/"
    : "https://www.google.com/";

  const dlArgs = [
    ...getJsRuntimeArgs(),
    ...getCookiesArgs(),
    ...getVpsArgs(),
    "--no-cache-dir",
    "--dump-json",
    "--no-warnings",
    "--no-check-certificate",
    "--referer",
    referer,
    "--add-header",
    "Sec-Fetch-Mode:navigate",
    "--add-header",
    "Sec-Fetch-Site:same-origin",
    "--add-header",
    "Sec-Fetch-Dest:document",
    "--no-playlist",
    finalUrl,
  ];

  const metadataProcess = spawn(getYtDlp(), dlArgs, { env: getDlpEnv() });

  const metadataTimeout = setTimeout(() => {
    metadataProcess.kill();
    console.error("[METADATA-TIMEOUT] Process killed after 60s");
  }, 60000);

  let metadata = "";
  let errorLog = "";

  metadataProcess.stdout.on("data", (data) => {
    metadata += data.toString();
  });

  metadataProcess.stderr.on("data", (data) => {
    errorLog += data.toString();
  });

  metadataProcess.on("close", async (code) => {
    try {
      clearTimeout(metadataTimeout);
      let finalTitle = options.title || "Untitled";
      let finalPlatform = "Generic";
      let views = "0";
      let likes = "0";
      let comments = "0";
      let shares = "0";
      let duration = "";
      let uploader = "";
      let isGallery = false;

      const { generateJobId } = require("./core-helpers");
      let jobId = generateJobId();

      createJob(target, {
        jobId,
        url: finalUrl,
        title: "",
        stats: { likes, views, comments, shares, duration, uploader },
        thumbnail: "",
        platform: "Generic",
        isGallery: false,
        hasVideo: true,
        isVideo: true,
        extractor: "Generic",
        directUrl: null,
      });

      const db = loadDB();

      if (code !== 0 || !metadata.trim()) {
        if (url.includes("instagram.com")) {
          await _editResponse({
            embeds: [
              getStatusEmbed(
                guild,
                "Instagram Link Found",
                "Checking link details. Starting the download...",
              ),
            ],
          });

          finalPlatform = "INSTAGRAM";
          db.jobs[jobId].platform = "INSTAGRAM";
          db.jobs[jobId].extractor = "instagram";
        } else {
          const cleanError = errorLog
            .replace(/\[\w+\]/g, "")
            .replace(/ERROR:/g, "")
            .trim()
            .split("\n")[0]
            .substring(0, 150);

          const isX = url.includes("://x.com") || url.includes("twitter.com");
          const xError =
            isX &&
            (cleanError.includes("No video") ||
              cleanError.includes("not found"));

          return await _editResponse({
            embeds: [
              getStatusEmbed(
                guild,
                isX ? "X Post Not Found" : "Download Failed",
                xError
                  ? "No video found in this tweet. If this is an Image post, it's currently not supported by the video extractor."
                  : cleanError || "Platform not supported or invalid link.",
              ),
            ],
          });
        }
      } else {
        try {
          const jsonStr = metadata.trim().split("\n").find(l => l.trim().startsWith("{"));
          if (!jsonStr) throw new Error("No JSON metadata found");
          const json = JSON.parse(jsonStr);
          const hasVideo = json.formats?.some(
            (f) => f.vcodec !== "none" && f.vcodec !== undefined,
          );
          const isTikTok = json.webpage_url?.includes("tiktok.com");

          finalTitle =
            finalTitle === "Untitled" || !finalTitle
              ? json.title || "Untitled"
              : finalTitle;
          finalPlatform = json.extractor || "Generic";
          views = json.view_count || "0";
          likes = json.like_count || "0";
          comments = json.comment_count || "0";
          shares = json.repost_count || "0";
          const durationSec = json.duration || 0;
          duration =
            durationSec > 0
              ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, "0")}`
              : "";
          uploader = json.uploader || "";
          const thumbnail = json.thumbnail || "";

          isGallery =
            json._type === "playlist" ||
            (json.entries && json.entries.length > 0) ||
            (isTikTok && !hasVideo);

          db.jobs[jobId] = {
            ...db.jobs[jobId],
            stats: { likes, views, comments, shares, duration, uploader },
            thumbnail,
            platform: finalPlatform,
            isGallery,
            hasVideo,
            isVideo: hasVideo,
            extractor: finalPlatform,
            directUrl: json.url || null,
          };
        } catch (e) {
          console.error("[JSON-PARSE] Error:", e.message);
        }
      }

      let cleanTitle = finalTitle.replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{1F170}-\u{1F251}]/gu,
        "",
      );

      cleanTitle = cleanTitle.replace(/#\S+/g, "");

      let safeTitle = cleanTitle.replace(/\s+/g, " ").trim();

      const titleLimit = 45;
      if (safeTitle.length > titleLimit) {
        safeTitle = safeTitle.substring(0, titleLimit) + "...";
      }

      safeTitle = safeTitle || "Media Content";
      db.jobs[jobId].title = safeTitle;
      saveDB(db);

      const job = db.jobs[jobId];
      const hasVideo = job?.hasVideo;

      if (options.type && (options.type === "mp3" || !isGallery)) {
        return await startDownload(target, jobId, options.type, {
          resolution: options.resolution,
          statusMsg,
        });
      }

      const botUser = await target.client.user.fetch();
      const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

      const foundEmbed = new EmbedBuilder()
        .setColor(colors.CORE)
        .setTitle(`${FIRE} **Media Found**`)
        .setImage(botBanner)
        .setDescription(
          `### ${CHECK} **Link Found**\n` +
            `${ARROW} **Topic:** *${safeTitle}*\n` +
            `${ARROW} **Platform:** *${finalPlatform.toUpperCase()}*\n\n` +
            `**${formatNumber(likes)}** *Likes*  •  **${formatNumber(comments)}** *Comments*  •  **${formatNumber(views)}** *Views*`,
        )
        .setFooter({
          text: "Pick a format to download",
          iconURL: target.client.user.displayAvatarURL(),
        });

      const row = new ActionRowBuilder();
      if (isGallery) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_gallery_${jobId}`)
            .setLabel("GALLERY (PHOTOS)")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`dl_mp3_${jobId}`)
            .setLabel("AUDIO (MP3)")
            .setStyle(ButtonStyle.Success),
        );
      } else {
        const isAudioOnly = url.includes("soundcloud.com") || !hasVideo;
        if (!isAudioOnly) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`dl_mp4_${jobId}`)
              .setLabel("VIDEO (MP4)")
              .setStyle(ButtonStyle.Primary),
          );
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_mp3_${jobId}`)
            .setLabel("AUDIO (MP3)")
            .setStyle(ButtonStyle.Success),
        );
      }

      const isMusic = musicKeywords.some((keyword) => url.includes(keyword));
      const isTikTok = url.includes("tiktok.com");
      const isCommand =
        target.isChatInputCommand && target.isChatInputCommand();
      const shouldDirect = !isTikTok || !isCommand || isMusic;

      if (shouldDirect && options.type) {
        const finalFormat =
          options.type === "mp3" || isMusic
            ? "mp3"
            : isGallery
              ? "gallery"
              : "mp4";
        return await startDownload(target, jobId, finalFormat, { statusMsg });
      }

      await _editResponse({
        embeds: [foundEmbed],
        components: [row],
      });
    } catch (e) {
      console.error("[CORE-CLOSE] Callback error:", e.message);
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Download Error",
            e.message || "An unexpected error occurred.",
          ),
        ],
      }).catch(() => {});
    }
  });
}

module.exports = {
  runYtDlpFlow,
  musicKeywords,
};
