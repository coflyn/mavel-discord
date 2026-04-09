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

async function runBandcampFlow(target, url, options = {}) {
  let statusMsg = options.statusMsg;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#00b894")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed("Bandcamp Info", "Getting song info...");

  if (!statusMsg) {
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
  } else {
    const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
    if (msg && msg.edit)
      await msg.edit({ embeds: [initialEmbed] }).catch(() => {});
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
      console.error("[BANDCAMP-EDIT] Error:", e.message);
    }
  };

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

    await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg, isAlbum };
  } catch (e) {
    console.error("[BANDCAMP-FLOW] Error:", e.message);
    await editResponse({
      embeds: [
        getStatusEmbed(
          "Bandcamp Search Failed",
          "Could not find the song info.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runBandcampFlow };
