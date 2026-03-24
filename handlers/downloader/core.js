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
const { loadDB, saveDB, formatNumber } = require("./core-helpers");
const { startDownload } = require("./callbacks");
const { runPixivFlow } = require("./pixiv-handler");
const { runTikTokFlow } = require("./tiktok-handler");
const { runCloudFlow } = require("./cloud-handler");
const { runSpotifyFlow } = require("./spotify-handler");
const { runTwitterFlow } = require("./twitter-handler");

async function runYtDlpFlow(target, url, options = {}) {
  let statusMsg;

  const isCommand = target.isChatInputCommand && target.isChatInputCommand();

  if (url.includes("pixiv.net")) {
    const jobResult = await runPixivFlow(target, url);
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
      isCommand,
      ...options,
    });
    if (!isCommand && jobResult && jobResult.jobId) {
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
    const jobResult = await runSpotifyFlow(target, url);
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "spmp3", {
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
    return await runCloudFlow(target, url);
  }

  if (
    url.includes("twitter.com") ||
    url.includes("x.com") ||
    url.includes("vxtwitter.com") ||
    url.includes("fixupx.com")
  ) {
    const jobResult = await runTwitterFlow(target, url);
    if (jobResult && jobResult.jobId) {
      return await startDownload(target, jobResult.jobId, "mp4", {
        statusMsg: jobResult.statusMsg,
      });
    }
    // If specialized Twitter flow fails, we fall back to generic yt-dlp
  }

  const guild = target.guild || target.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("amogus", "🛰️");
  const FIRE = getEmoji("purple_fire", "🔥");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#1e4d2b")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "Checking link...",
    "Scanning resource parameters...",
  );

  if (target.replied || target.deferred) {
    statusMsg = await target.editReply({
      embeds: [initialEmbed],
      withResponse: true,
    });
  } else if (target.isChatInputCommand && target.isChatInputCommand()) {
    statusMsg = await target.reply({
      embeds: [initialEmbed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });
  } else {
    statusMsg = target.reply
      ? await target.reply({ embeds: [initialEmbed], withResponse: true })
      : await target.channel.send({ embeds: [initialEmbed] });
  }

  const editResponse = async (data) => {
    try {
      const payload = typeof data === "string" ? { content: data } : data;
      if (target.editReply) {
        return await target.editReply(payload);
      } else {
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        return await msg.edit(payload);
      }
    } catch (e) {
      console.error("[EDIT-RESPONSE] Error:", e.message);
    }
  };

  let finalUrl = url;
  if (url.includes("tiktok.com") && url.includes("/photo/")) {
    finalUrl = url.replace("/photo/", "/video/");
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
  let metadata = "";
  let errorLog = "";

  metadataProcess.stdout.on("data", (data) => {
    metadata += data.toString();
  });

  metadataProcess.stderr.on("data", (data) => {
    errorLog += data.toString();
  });

  metadataProcess.on("close", async (code) => {
    let finalTitle = "Untitled";
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
        const isPhoto =
          errorLog.toLowerCase().includes("no video") ||
          errorLog.toLowerCase().includes("not a video");

        finalTitle = isPhoto ? "Instagram Photo/Gallery" : "Instagram Resource";
        finalPlatform = "INSTAGRAM";
        db.jobs[jobId].platform = "INSTAGRAM";
        db.jobs[jobId].extractor = "instagram";
        if (isPhoto) db.jobs[jobId].isGallery = true;
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
          (cleanError.includes("No video") || cleanError.includes("not found"));

        return await editResponse({
          embeds: [
            getStatusEmbed(
              isX ? "X/Twitter Identification" : "Download Failed",
              xError
                ? "No video found in this tweet. If this is an Image post, it's currently not supported by the video extractor."
                : cleanError || "Platform not supported or invalid link.",
            ),
          ],
        });
      }
    } else {
      try {
        const json = JSON.parse(metadata.trim());
        const hasVideo = json.formats?.some(
          (f) => f.vcodec !== "none" && f.vcodec !== undefined,
        );
        const isTikTok = json.webpage_url?.includes("tiktok.com");

        finalTitle = json.title || "Untitled";
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
      .setColor("#00008b")
      .setTitle(`${FIRE} **Media Research Found**`)
      .setImage(botBanner)
      .setDescription(
        `### ✅ **Resource Identified**\n` +
          `${ARROW} **Topic:** *${safeTitle}*\n` +
          `${ARROW} **Platform:** *${finalPlatform.toUpperCase()}*\n\n` +
          `**${formatNumber(likes)}** *Likes*  •  **${formatNumber(comments)}** *Comments*  •  **${formatNumber(views)}** *Views*`,
      )
      .setFooter({
        text: "Select Format to Initialize Download",
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

    const isTikTok = url.includes("tiktok.com");
    const shouldDirect = !isTikTok || !isCommand;

    if (shouldDirect && options.type) {
      const finalFormat =
        options.type === "mp3" ? "mp3" : isGallery ? "gallery" : "mp4";
      return await startDownload(target, jobId, finalFormat, { statusMsg });
    }

    await editResponse({
      embeds: [foundEmbed],
      components: [row],
    });
  });
}

module.exports = {
  runYtDlpFlow,
};
