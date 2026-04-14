const { spawn } = require("child_process");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

async function runYoutubeFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, "YouTube", "Let's get that video for you...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "YouTube", "Let's get that video for you...");
  }

  try {
    const cleanUrl = url.split("&list=")[0].split("?si=")[0];
    const isShorts = cleanUrl.includes("/shorts/");

    const dlArgs = [
      ...getJsRuntimeArgs(),
      ...getCookiesArgs(),
      ...getVpsArgs(),
      "--dump-json",
      "--no-warnings",
      "--no-playlist",
      cleanUrl,
    ];

    const proc = spawn(getYtDlp(), dlArgs, { env: getDlpEnv() });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));

    const code = await new Promise((resolve) => proc.on("close", resolve));

    if (code !== 0 || !stdout.trim()) {
      throw new Error("Could not get YouTube video info.");
    }

    const json = JSON.parse(stdout.trim().split("\n")[0]);
    const author = json.uploader || "Unknown Uploader";
    const title = json.title || "Untitled Video";
    const thumbnail = json.thumbnail || "";
    const jobId = Math.random().toString(36).substring(2, 10);

    const durationSec = json.duration || 0;
    const duration =
      durationSec > 0
        ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, "0")}`
        : "LIVE";

    const stats = {
      likes: json.like_count || "0",
      views: json.view_count || "0",
      comments: json.comment_count || "0",
      shares: "---",
      duration,
      uploader: author,
    };

    const db = loadDB();
    db.jobs[jobId] = {
      url: cleanUrl,
      timestamp: Date.now(),
      title: title,
      stats,
      thumbnail,
      platform: isShorts ? "YouTube Shorts" : "YouTube Video",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: true,
      extractor: "youtube",
      directUrl: null,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#00b894")
      .setTitle(`${NOTIF} **YouTube Video Found**`)
      .setImage(thumbnail)
      .setDescription(
        `### ${LEA} *Media Found*\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Channel:** *${author}*\n` +
          `${ARROW} **Type:** *YouTube ${isShorts ? "Short" : "Video"}*\n\n` +
          `**${formatNumber(stats.likes)}** *Likes*  •  **${formatNumber(stats.views)}** *Views*`,
      )
      .setFooter({
        text: "MaveL YouTube | Select format below",
        iconURL: target.client.user.displayAvatarURL(),
      });

    await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg, isShorts };
  } catch (e) {
    console.error("[YOUTUBE-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [
        getStatusEmbed(
          "Video not available",
          "Could not connect to the video. It may be private or age-restricted.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runYoutubeFlow };
