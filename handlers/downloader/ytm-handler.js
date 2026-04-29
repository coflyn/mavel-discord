const { spawn } = require("child_process");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runYtmFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("YouTube Music", "Searching for music...");

  try {
    const cleanUrl = url.split("&list=")[0].split("?si=")[0];
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
      throw new Error("Could not find the song details.");
    }

    const json = JSON.parse(stdout.trim().split("\n")[0]);
    const artist = json.artist || json.uploader || "Unknown Artist";
    const title = json.title || "Untitled Track";
    const thumbnail = json.thumbnail || "";
    const album = json.album || "Single";
    const duration = json.duration_string || `${Math.floor((json.duration || 0) / 60)}m`;
    
    const stats = {
      views: json.view_count || 0,
      likes: json.like_count || 0,
      duration: duration,
      uploader: artist,
    };

    const jobId = createJob(target, {
      url: cleanUrl,
      title: title,
      stats,
      thumbnail,
      platform: "YouTube Music",
      isGallery: false,
      hasVideo: false,
      extractor: "youtube",
      directUrl: null,
    });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.MUSIC_DL)
      .setTitle(`${NOTIF} **YouTube Music Found**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} **Song Found**\n` +
          `${ctx.ARROW} **Title:** *${title}*\n` +
          `${ctx.ARROW} **Artist:** *${artist}*\n` +
          `${ctx.ARROW} **Album:** *${album}*\n` +
          `${ctx.ARROW} **Duration:** *${duration}*\n\n` +
          `*Everything looks good. Starting the download...*`,
      )
      .setFooter({
        text: "MaveL Music",
        iconURL: target.client.user.displayAvatarURL(),
      });

    if (options.isCommand) {
      return await startDownload(target, jobId, "mp3", { statusMsg: ctx.statusMsg });
    }

    await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: ctx.statusMsg };
  } catch (e) {
    console.error("[YTM-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Song not available",
          "Could not connect to the song. It may be restricted or private.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runYtmFlow };
