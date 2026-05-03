const { spawn } = require("child_process");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const {
  createJob,
  createHandlerContext,
  formatNumber,
} = require("./core-helpers");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runYoutubeFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("YouTube", "Let's get that video for you...");

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

    const stats = {
      views: json.view_count || 0,
      likes: json.like_count || 0,
      duration:
        json.duration_string || `${Math.floor((json.duration || 0) / 60)}m`,
      uploader: author,
    };

    const jobId = createJob(target, {
      url: cleanUrl,
      title: title,
      stats,
      thumbnail,
      platform: isShorts ? "YouTube Shorts" : "YouTube Video",
      isGallery: false,
      hasVideo: true,
      isVideo: true,
      extractor: "youtube",
      directUrl: null,
    });

    const CHECK = ctx.getEmoji("check", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.MUSIC_DL)
      .setTitle(`${NOTIF} **YouTube Video Found**`)
      .setImage(thumbnail)
      .setDescription(
        `### ${CHECK} *Media Found*\n` +
          `${ctx.ARROW} **Title:** *${title}*\n` +
          `${ctx.ARROW} **Channel:** *${author}*\n` +
          `${ctx.ARROW} **Type:** *YouTube ${isShorts ? "Short" : "Video"}*\n\n` +
          `**${formatNumber(stats.likes)}** *Likes*  •  **${formatNumber(stats.views)}** *Views*`,
      )
      .setFooter({
        text: "MaveL YouTube | Select format below",
        iconURL: target.client.user.displayAvatarURL(),
      });

    return await ctx.finalize(jobId, options.type, foundEmbed, {
      ...options,
      extraRet: { isShorts },
    });
  } catch (e) {
    console.error("[YOUTUBE-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Video not available",
          "Could not connect to the video. It may be private or age-restricted.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runYoutubeFlow };
