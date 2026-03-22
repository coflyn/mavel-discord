const { spawn } = require("child_process");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const ffmpegStatic = require("ffmpeg-static");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");
const { startDownload } = require("./callbacks");

async function runYtDlpFlow(target, url, options = {}) {
  let statusMsg;
  const statusText = "*Checking link...*";

  if (target.replied || target.deferred) {
    statusMsg = await target.editReply({
      content: statusText,
      withResponse: true,
    });
  } else if (target.isChatInputCommand && target.isChatInputCommand()) {
    statusMsg = await target.reply({
      content: statusText,
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });
  } else {
    statusMsg = target.reply
      ? await target.reply({ content: statusText, withResponse: true })
      : await target.channel.send(statusText);
  }

  const editResponse = async (data) => {
    try {
      if (target.editReply) {
        return await target.editReply(data);
      } else {
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        return await msg.edit(data);
      }
    } catch (e) {
      console.error("[EDIT-RESPONSE] Error:", e.message);
    }
  };

  const referer = url.includes("instagram.com")
    ? "https://www.instagram.com/"
    : url.includes("tiktok.com")
      ? "https://www.tiktok.com/"
      : url.includes("twitter.com") || url.includes("x.com")
        ? "https://twitter.com/"
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
    "--ffmpeg-location",
    ffmpegStatic,
    url,
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

    if (code !== 0 || !metadata.trim()) {
      if (url.includes("instagram.com")) {
        finalTitle = "Instagram Video";
        finalPlatform = "INSTAGRAM";
      } else if (
        url.includes("x.com") ||
        url.includes("twitter.com") ||
        url.includes("threads.net")
      ) {
        return await editResponse({
          content: "*Note: For this platform (X/Threads), only Video downloads are supported.*",
        });
      } else {
        const cleanError = errorLog
          .replace(/\[\w+\]/g, "")
          .replace(/ERROR:/g, "")
          .trim()
          .split("\n")[0]
          .substring(0, 150);

        return await editResponse({
          content: `*Download failed.*\n\n` + (cleanError ? `*${cleanError}*` : `*Platform not supported or invalid link.*`),
        });
      }
    } else {
      try {
        const json = JSON.parse(metadata.trim());
        finalTitle = json.title || "Untitled";
        finalPlatform = json.extractor || "Generic";
        views = json.view_count || "0";
        likes = json.like_count || "0";
        comments = json.comment_count || "0";
        shares = json.repost_count || "0";
        const durationSec = json.duration || 0;
        duration = durationSec > 0 ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : "";
        uploader = json.uploader || "";
        isGallery = json._type === 'playlist' || (json.entries && json.entries.length > 0);
      } catch (e) {
        console.error("[JSON-PARSE] Error:", e.message);
      }
    }

    const cleanTitle = finalTitle.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{1F170}-\u{1F251}]/gu, "");
    const safeTitle = cleanTitle.trim().substring(0, 100) || "Video";

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: safeTitle,
      stats: { likes, views, comments, shares, duration, uploader },
      platform: finalPlatform,
      userId: target.user ? target.user.id : target.author.id,
      isGallery
    };
    saveDB(db);

    if (options.type && (options.type === 'mp3' || !isGallery)) {
      return await startDownload(target, jobId, options.type, options.resolution, statusMsg);
    }

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
          .setStyle(ButtonStyle.Success)
      );
    } else {
      const isAudioOnly = url.includes("soundcloud.com");
      if (!isAudioOnly) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_mp4_${jobId}`)
            .setLabel("VIDEO (MP4)")
            .setStyle(ButtonStyle.Primary)
        );
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_mp3_${jobId}`)
          .setLabel("AUDIO (MP3)")
          .setStyle(ButtonStyle.Success)
      );
    }

    const statsValid = likes !== "0" || views !== "0" || comments !== "0" || shares !== "0";
    const metadataText = statsValid
      ? `*${formatNumber(likes)} Likes  •  ${formatNumber(comments)} Comments  •  ${formatNumber(shares)} Shares  •  ${formatNumber(views)} Views*`
      : "";

    await editResponse({
      content: `*Found: ${safeTitle}*\n*Platform: ${finalPlatform.toUpperCase()}*\n${metadataText}`,
      components: [row],
    });
  });
}

module.exports = {
  runYtDlpFlow,
};
