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

async function runBandcampFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("Bandcamp Info", "Getting song info...");

  try {
    const cleanUrl = url.split("?")[0].split("#")[0];

    const dlArgs = [
      ...getJsRuntimeArgs(),
      ...getCookiesArgs(),
      ...getVpsArgs(),
      "--dump-json",
      "--no-warnings",
      "--playlist-items",
      "1",
      cleanUrl,
    ];

    const proc = spawn(getYtDlp(), dlArgs, { env: getDlpEnv() });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));

    const code = await new Promise((resolve) => proc.on("close", resolve));

    if (code !== 0 || !stdout.trim()) {
      throw new Error("Could not get song info.");
    }

    const json = JSON.parse(stdout.trim().split("\n")[0]);
    const isAlbum = url.includes("/album/");
    const artist = json.uploader || json.artist || "Unknown Artist";
    const trackTitle = json.title || "Untitled Track";
    const thumbnail = json.thumbnail || "";
    const duration = json.duration_string || `${Math.floor((json.duration || 0) / 60)}m`;
    const jobId = createJob(target, {
      url: cleanUrl,
      title: isAlbum ? `[Album] ${trackTitle}` : trackTitle,
      stats: {
        likes: "---",
        views: "---",
        comments: "---",
        shares: "---",
        duration,
        uploader: artist,
      },
      thumbnail,
      platform: isAlbum ? "Bandcamp (Album)" : "Bandcamp (Track)",
      isGallery: isAlbum,
      hasVideo: false,
      extractor: "bandcamp",
      directUrl: json.url || null,
    });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.MUSIC_DL)
      .setTitle(`${NOTIF} **Bandcamp Audio Ready**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} *Song Found*\n` +
          `${ctx.ARROW} **Title:** *${isAlbum ? `[Album] ${trackTitle}` : trackTitle}*\n` +
          `${ctx.ARROW} **Artist:** *${artist}*\n` +
          `${ctx.ARROW} **Type:** *${isAlbum ? "Album" : "Track"}*\n\n` +
          `*Everything is ready. Starting the download.*`,
      )
      .setFooter({
        text: "MaveL Bandcamp",
        iconURL: target.client.user.displayAvatarURL(),
      });

    if (options.isCommand && options.type) {
      return await startDownload(target, jobId, isAlbum ? "twgallery" : "mp3", {
        statusMsg: ctx.statusMsg,
      });
    }

    await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: ctx.statusMsg, isAlbum };
  } catch (e) {
    console.error("[BANDCAMP-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Song not available",
          "Could not connect to Bandcamp. The link may be invalid.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runBandcampFlow };
