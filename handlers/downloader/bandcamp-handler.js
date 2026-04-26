const { spawn } = require("child_process");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

const { startDownload } = require("./callbacks");

async function runBandcampFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Bandcamp Info", "Getting song info...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "Bandcamp Info", "Getting song info...");
  }

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
    const jobId = Math.random().toString(36).substring(2, 10);

    const durationSec = json.duration || 0;
    const duration =
      durationSec > 0
        ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, "0")}`
        : isAlbum
          ? "Album"
          : "Track";

    const db = loadDB();
    db.jobs[jobId] = {
      url: cleanUrl,
      timestamp: Date.now(),
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
      userId: target.user ? target.user.id : target.author.id,
      isGallery: isAlbum,
      hasVideo: false,
      extractor: "bandcamp",
      directUrl: json.url || null,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#00b894")
      .setTitle(`${NOTIF} **Bandcamp Audio Ready**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} *Song Found*\n` +
          `${ARROW} **Title:** *${isAlbum ? `[Album] ${trackTitle}` : trackTitle}*\n` +
          `${ARROW} **Artist:** *${artist}*\n` +
          `${ARROW} **Type:** *${isAlbum ? "Album" : "Track"}*\n\n` +
          `*Everything is ready. Starting the download.*`,
      )
      .setFooter({
        text: "MaveL Bandcamp",
        iconURL: target.client.user.displayAvatarURL(),
      });

    if (options.isCommand && options.type) {
      return await startDownload(target, jobId, isAlbum ? "twgallery" : "mp3", {
        statusMsg,
      });
    }

    await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg, isAlbum };
  } catch (e) {
    console.error("[BANDCAMP-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Song not available",
          "Could not connect to Bandcamp. The link may be invalid.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runBandcampFlow };
