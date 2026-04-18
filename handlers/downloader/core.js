const { spawn } = require("child_process");
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
const {
  loadDB,
  saveDB,
  formatNumber,
  sendAdminLog,
} = require("./core-helpers");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");
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
  let statusMsg;

  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("amogus", "🛰️");
  const FIRE = getEmoji("purple_fire", "🔥");

  const initialEmbed = getStatusEmbed(guild, "Checking link...", "Getting link info...");
  statusMsg = await sendInitialStatus(target, "Checking link...", "Getting link info...");

  await sendAdminLog(target.client, {
    title: "Link Detected",
    message: `Bot is processing a new link.`,
    user: (target.user || target.author || {}).tag || "Unknown",
    platform: "SCANNER",
    url: url,
  });

  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (url.includes("pixiv.net")) {
    const jobResult = await runPixivFlow(target, url, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(
        target,
        jobResult.jobId,
        jobResult.isUgoira ? "pixiv_ugoira" : "pixiv_gallery",
        { statusMsg: jobResult.statusMsg },
      );
    }
    return;
  }
  if (url.includes("tiktok.com")) {
    const jobResult = await runTikTokFlow(target, url, {
      isCommand: target.isChatInputCommand && target.isChatInputCommand(),
      statusMsg,
      ...options,
    });
    if (
      !(target.isChatInputCommand && target.isChatInputCommand()) &&
      jobResult &&
      jobResult.jobId
    ) {
      return await startDownload(
        target,
        jobResult.jobId,
        jobResult.isGallery ? "tkgallery" : "tkmp4",
        { statusMsg: jobResult.statusMsg },
      );
    }
    return;
  }

  if (url.includes("open.spotify.com")) {
    const jobResult = await runSpotifyFlow(target, url, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "spmp3", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }
  if (url.includes("bandcamp.com")) {
    const jobResult = await runBandcampFlow(target, url, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(
        target,
        jobResult.jobId,
        jobResult.isAlbum ? "twgallery" : "mp3",
        { statusMsg: jobResult.statusMsg },
      );
    }
    return;
  }
  if (url.includes("music.youtube.com")) {
    const jobResult = await runYtmFlow(target, url, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "mp3", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const jobResult = await runYoutubeFlow(target, url, {
      statusMsg,
      ...options,
    });
    if (jobResult && jobResult.jobId) {
      const finalFormat = options.type || "mp4";
      return await startDownload(target, jobResult.jobId, finalFormat, {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }
  if (
    url.includes("mediafire.com") ||
    url.includes("drive.google.com") ||
    url.includes("mega.nz") ||
    url.includes("mega.co.nz")
  ) {
    return await runCloudFlow(target, url, { statusMsg });
  }

  if (finalUrl.includes("instagram.com")) {
    const jobResult = await runInstagramFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(
        target,
        jobResult.jobId,
        jobResult.isMix || jobResult.isGallery
          ? "twgallery"
          : jobResult.isVideo
            ? "mp4"
            : "photo",
        {
          statusMsg: jobResult.statusMsg,
        },
      );
    }
    return null;
  }

  if (
    finalUrl.includes("twitter.com") ||
    finalUrl.includes("x.com") ||
    finalUrl.includes("vxtwitter.com") ||
    finalUrl.includes("fixupx.com")
  ) {
    const jobResult = await runTwitterFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(
        target,
        jobResult.jobId,
        jobResult.isGallery ? "twgallery" : jobResult.isVideo ? "mp4" : "photo",
        {
          statusMsg: jobResult.statusMsg,
        },
      );
    }
    return null;
  }

  if (finalUrl.includes("threads.net") || finalUrl.includes("threads.com")) {
    const jobResult = await runThreadsFlow(target, finalUrl, {
      statusMsg,
      ...options,
    });
    if (!jobResult) return null;
    if (jobResult.jobId && jobResult.jobId !== null) {
      const finalFormat = options.type || "mp4";
      return await startDownload(target, jobResult.jobId, finalFormat, {
        statusMsg: jobResult.statusMsg,
      });
    }
    return null;
  }

  if (finalUrl.includes("soundcloud.com")) {
    const jobResult = await runSoundcloudFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "mp3", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return null;
  }

  if (finalUrl.includes("pinterest.com") || finalUrl.includes("pin.it")) {
    const isVideo = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      const checkProcess = spawn(getYtDlp(), ["--simulate", "--get-url", finalUrl], { env: getDlpEnv() });
      let stdout = "";
      checkProcess.stdout.on("data", (data) => { stdout += data.toString(); });
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
      let jobId = Math.random().toString(36).substring(2, 10);
      const db = loadDB();

      const meta = await new Promise((resolve) => {
        const metaProcess = spawn(getYtDlp(), ["--simulate", "--print", "%(duration)s|%(uploader)s|%(title)s", finalUrl], { env: getDlpEnv() });
        let stdout = "";
        metaProcess.stdout.on("data", (data) => { stdout += data.toString(); });
        metaProcess.on("close", (code) => {
          if (code !== 0 || !stdout) resolve("||");
          else resolve(stdout.trim());
        });
        metaProcess.on("error", () => resolve("||"));
      });
      const [dur, uploader, rawTitle] = meta.split("|");

      db.jobs[jobId] = {
        url: finalUrl,
        timestamp: Date.now(),
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
        userId: target.user ? target.user.id : target.author?.id || "unknown",
        isGallery: false,
        hasVideo: true,
        extractor: "pinterest",
        directUrl: null,
      };
      saveDB(db);
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

  if (
    finalUrl.includes("facebook.com") ||
    finalUrl.includes("fb.watch") ||
    finalUrl.includes("fb.com")
  ) {
    const jobResult = await require("./facebook-handler").runFacebookFlow(
      target,
      finalUrl,
      { statusMsg, ...options },
    );
    if (jobResult && jobResult.jobId) {
      const finalFormat = options.type || "mp4";
      return await startDownload(target, jobResult.jobId, finalFormat, {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (finalUrl.includes("slideshare.net")) {
    const jobResult = await require("./slideshare-handler").runSlideshareFlow(
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

  if (finalUrl.includes("scribd.com")) {
    const jobResult = await runScribdFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (finalUrl.includes("academia.edu")) {
    const jobResult = await runAcademiaFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (finalUrl.includes("calameo.com")) {
    const jobResult = await runCalameoFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (
    finalUrl.includes("komiku.id") ||
    finalUrl.includes("komiku.com") ||
    finalUrl.includes("komiku.org")
  ) {
    const jobResult = await runKomikuFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (finalUrl.includes("docplayer") || finalUrl.includes("dplayer")) {
    const jobResult = await runDPlayerFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "cloud", {
        statusMsg: jobResult.statusMsg,
      });
    }
    return;
  }

  if (finalUrl.includes("nhentai.net")) {
    const jobResult = await runNSrvFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
        platform: "Signal Archive"
      });
    }
    return;
  }

  if (finalUrl.includes("pornhub.com")) {
    return await runPSrvFlow(target, finalUrl, { statusMsg });
  }

  if (finalUrl.includes("doujindesu.tv")) {
    const jobResult = await runDSrvFlow(target, finalUrl, { statusMsg });
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "twgallery", {
        statusMsg: jobResult.statusMsg,
        platform: "Proxy Sync"
      });
    }
    return;
  }
  if (finalUrl.includes("tiktok.com") && finalUrl.includes("/photo/")) {
    finalUrl = finalUrl.replace("/photo/", "/video/");
  }

  const referer = finalUrl.includes("instagram.com")
    ? "https://www.instagram.com/"
    : finalUrl.includes("tiktok.com")
      ? "https://www.tiktok.com/"
      : finalUrl.includes("twitter.com") ||
          finalUrl.includes("x.com") ||
          finalUrl.includes("vxtwitter.com") ||
          finalUrl.includes("fixupx.com")
        ? "https://x.com/"
        : finalUrl.includes("pinterest.com") || finalUrl.includes("pin.it")
          ? "https://www.pinterest.com/"
          : finalUrl.includes("music.youtube.com") ||
              finalUrl.includes("youtube.com")
            ? "https://www.youtube.com/"
            : finalUrl.includes("capcut.com")
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
    console.error("[METADATA-TIMEOUT] Process killed after 30s");
  }, 30000);

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

      let jobId = Math.random().toString(36).substring(2, 10);
      const db = loadDB();

      db.jobs[jobId] = {
        url: finalUrl,
        timestamp: Date.now(),
        title: "",
        stats: { likes, views, comments, shares, duration, uploader },
        thumbnail: "",
        platform: "Generic",
        userId: target.user ? target.user.id : target.author.id,
        isGallery: false,
        hasVideo: true,
        extractor: "Generic",
        directUrl: null,
      };

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

          const isX = url.includes("x.com") || url.includes("twitter.com");
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
          const json = JSON.parse(metadata.trim().split("\n")[0]);
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
            extractor: finalPlatform,
            directUrl: json.url || null,
          };
        } catch (e) {
          console.error("[JSON-PARSE] Error:", e.message);
        }
      }

      const cleanTitle = finalTitle.replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{1F170}-\u{1F251}]/gu,
        "",
      );
      const safeTitle = cleanTitle.trim().substring(0, 100) || "Video";
      db.jobs[jobId].title = safeTitle;
      saveDB(db);

      const job = db.jobs[jobId];
      const hasVideo = job?.hasVideo;

      if (options.type && (options.type === "mp3" || !isGallery)) {
        return await startDownload(
          target,
          jobId,
          options.type,
          options.resolution,
          statusMsg,
        );
      }

      const botUser = await target.client.user.fetch();
      const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

      const foundEmbed = new EmbedBuilder()
        .setColor("#6c5ce7")
        .setTitle(`${FIRE} **Media Found**`)
        .setImage(botBanner)
        .setDescription(
          `### ✅ **Link Found**\n` +
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
      const isCommand = target.isChatInputCommand && target.isChatInputCommand();
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
            "Processing Error",
            e.message || "An unexpected error occurred.",
          ),
        ],
      }).catch(() => {});
    }
  });
}

module.exports = {
  runYtDlpFlow,
};
