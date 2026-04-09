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

async function runYtmFlow(target, url, options = {}) {
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

  const getStatusEmbed = (status, info) => {
    return new EmbedBuilder()
      .setColor("#00b894")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Info:** *${info}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "YouTube Music",
    "Searching for music...",
  );

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
      console.error("[YTM-EDIT] Error:", e.message);
    }
  };

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
  }

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
    const jobId = Math.random().toString(36).substring(2, 10);

    const durationSec = json.duration || 0;
    const duration =
      durationSec > 0
        ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, "0")}`
        : "LIVE";

    const stats = {
      likes: json.like_count || "---",
      views: json.view_count || "---",
      duration: duration,
      artist: artist,
      album: album,
    };

    const db = loadDB();
    db.jobs[jobId] = {
      url: cleanUrl,
      timestamp: Date.now(),
      title: title,
      stats,
      thumbnail,
      platform: "YouTube Music",
      userId: target.user ? target.user.id : target.author?.id || "unknown",
      isGallery: false,
      hasVideo: false,
      extractor: "youtube",
      directUrl: null,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#00b894")
      .setTitle(`${NOTIF} **YouTube Music Found**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} **Song Found**\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Artist:** *${artist}*\n` +
          `${ARROW} **Album:** *${album}*\n` +
          `${ARROW} **Duration:** *${duration}*\n\n` +
          `*Everything looks good. Starting the download...*`,
      )
      .setFooter({
        text: "MaveL Music",
        iconURL: target.client.user.displayAvatarURL(),
      });

    await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg };
  } catch (e) {
    console.error("[YTM-FLOW] Error:", e.message);
    await editResponse({
      embeds: [
        getStatusEmbed(
          "Song not available",
          "Could not connect to the song. It may be restricted or private.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runYtmFlow };
