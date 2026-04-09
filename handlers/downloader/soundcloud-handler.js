const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

async function runSoundcloudFlow(target, url, options = {}) {
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
  const AUDIO = getEmoji("three_dots", "🎵");
  const FIRE = getEmoji("purple_fire", "🔥");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#00b894")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const editResponse = async (data) => {
    try {
      const payload = typeof data === "string" ? { content: data } : data;
      if (statusMsg) {
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        return await msg.edit(payload);
      }
      if (target.editReply) {
        return await target.editReply(payload);
      }
    } catch (e) {
      console.error("[SC-EDIT] Error:", e.message);
    }
  };

  const initialEmbed = getStatusEmbed(
    "SoundCloud Music",
    "Searching for song...",
  );

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
    const {
      getYtDlp,
      getCookiesArgs,
      getCookiesPath,
    } = require("../../utils/dlp-helpers");
    const cookiesArgs = getCookiesArgs().join(" ");

    let scrapeSuccess = false;
    let title = "SoundCloud Track";
    let artist = "Unknown Artist";
    let thumbnail = "";
    let mediaUrl = null;
    let stats = {
      likes: "---",
      plays: "---",
      comments: "---",
      duration: "---",
    };
    let discoveryPath = "";

    const ytData = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 12000);
      exec(
        `${getYtDlp()} ${cookiesArgs} --simulate --dump-json --no-check-certificate "${url}"`,
        (err, stdout) => {
          clearTimeout(timeout);
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            resolve(null);
          }
        },
      );
    });

    if (ytData) {
      title = ytData.title || title;
      artist = ytData.uploader || artist;
      thumbnail = (ytData.thumbnail || "").replace("-large", "-t500x500");
      mediaUrl = ytData.url;
      const dur = ytData.duration || 0;
      stats.duration =
        dur > 0
          ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, "0")}`
          : "---";
      stats.likes = ytData.like_count || "---";
      stats.plays = ytData.view_count || "---";
      stats.comments = ytData.comment_count || "---";

      const isPreview =
        (ytData.duration_string || "").includes("0:30") ||
        (dur > 0 && dur <= 35) ||
        (mediaUrl &&
          (mediaUrl.includes("preview") || mediaUrl.includes("/30/")));

      if (isPreview) {
        console.log(
          "[SC-FLOW] Warning: Restricted song found. Trying again...",
        );
      } else if (mediaUrl) {
        scrapeSuccess = true;
        discoveryPath = "SoundCloud (Direct)";
      }
    }

    if (!scrapeSuccess) {
      try {
        const res = await axios.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          },
          timeout: 8000,
        });
        const $ = cheerio.load(res.data);
        const scripts = Array.from($("script"));

        const ogTitle = $('meta[property="og:title"]').attr("content") || title;
        if (ogTitle.includes("by")) {
          const parts = ogTitle.split(" by ");
          title = parts[0].trim();
          artist = parts[1].trim();
        }
        thumbnail = (
          $('meta[property="og:image"]').attr("content") || thumbnail
        ).replace("-large", "-t500x500");

        for (const s of scripts) {
          const scriptText = $(s).html() || "";
          if (scriptText.includes("window.__sc_hydration")) {
            const hydrationMatch = scriptText.match(
              /window\.__sc_hydration\s*=\s*(\[.*?\]);/s,
            );
            if (hydrationMatch) {
              const hydration = JSON.parse(hydrationMatch[1]);
              const trackData = hydration.find((i) => i.hydratable === "track");
              if (trackData && trackData.data) {
                const info = trackData.data;
                title = info.title || title;
                artist = info.user?.username || artist;
                stats.plays = info.playback_count || stats.plays;
                stats.likes = info.likes_count || stats.likes;

                const realDur = info.full_duration || info.duration || 0;
                if (realDur > 35100) {
                  const d = realDur / 1000;
                  stats.duration = `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`;
                  console.log(
                    `[SC-METADATA] Forced correct duration: ${stats.duration}`,
                  );
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("[SC-SCRAPE-FAIL]", e.message);
      }
    }

    if (!scrapeSuccess && !mediaUrl) {
      if (ytData && ytData.url) {
        mediaUrl = ytData.url;
        scrapeSuccess = true;
        discoveryPath = "SoundCloud (Restricted/Preview)";
      } else {
        throw new Error("Could not extract any playable stream.");
      }
    }

    const isPremiumLocked =
      mediaUrl &&
      (mediaUrl.includes("preview") ||
        mediaUrl.includes("/30/") ||
        ((ytData?.duration || 0) > 0 && (ytData?.duration || 0) <= 35));
    if (isPremiumLocked && !discoveryPath.includes("Bypass")) {
      discoveryPath = "SoundCloud (Premium Locked/Preview)";
    }

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: `${title} (${artist})`,
      stats: stats,
      thumbnail: thumbnail,
      platform: "SoundCloud",
      userId: target.user ? target.user.id : target.author?.id || "unknown",
      isGallery: false,
      hasVideo: false,
      isVideo: false,
      discovery: discoveryPath,
      directUrl:
        discoveryPath.includes("Direct") || discoveryPath.includes("Bypass")
          ? null
          : mediaUrl,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");
    const isLocked = discoveryPath.includes("Locked");

    const foundEmbed = new EmbedBuilder()
      .setColor(isLocked ? "#fab1a0" : "#00b894")
      .setTitle(
        `${NOTIF} **${isLocked ? "SoundCloud Preview Only" : "SoundCloud Song Ready"}**`,
      )
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} **${isLocked ? "Preview Found" : "Song Found"}**\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Artist:** *${artist}*\n` +
          `${ARROW} **Plays:** *${stats.plays}*\n` +
          `${ARROW} **Length:** *${stats.duration}*\n\n` +
          (isLocked
            ? `> [!WARNING]\n> This track is strictly restricted by **SoundCloud Go+** (Premium). Only the 30-second preview was accessible from the server.`
            : `*Everything is ready. Starting the download...*`),
      )
      .setFooter({
        text: "MaveL Music",
        iconURL: target.client.user.displayAvatarURL(),
      });

    const resMsg = await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    console.error("[SC-FLOW] Error:", e.message);
    await editResponse({
      embeds: [
        getStatusEmbed(
          "Download Failed",
          e.message || "Could not retrieve the song.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runSoundcloudFlow };
