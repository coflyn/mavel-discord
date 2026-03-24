const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runTwitterFlow(target, url) {
  let statusMsg;
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
      .setColor("#1DA1F2")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "X / Twitter Hub",
    "Refining signal frequency...",
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
      console.error("[TWITTER-EDIT] Error:", e.message);
    }
  };

  try {
    const statusIdMatch = url.match(/status\/(\d+)/);
    if (!statusIdMatch) throw new Error("Invalid X/Twitter URL ID.");
    const statusId = statusIdMatch[1];

    let mediaUrl = null;
    let title = "X/Twitter Post";
    let author = "Anonymous";
    let stats = { likes: 0, views: 0, comments: 0, shares: 0, duration: "---" };
    let thumbnail = "";
    let isVideo = false;

    const providers = ["fxtwitter.com", "vxtwitter.com", "fixupx.com"];
    let scrapeSuccess = false;

    for (const provider of providers) {
      if (scrapeSuccess) break;
      try {
        const apiRes = await axios.get(
          `https://${provider}/status/${statusId}`,
          {
            timeout: 8000,
            headers: {
              "User-Agent": "Discordbot/2.0 (+https://discordapp.com)",
            },
          },
        );
        const html = apiRes.data;
        const $ = cheerio.load(html);

        const metaTitle =
          $('meta[property="og:title"]').attr("content") || author;
        author = metaTitle.split(" (")[0] || author;
        let rawDesc =
          $('meta[property="og:description"]').attr("content") || title;
        if (rawDesc.match(/Quoting/i))
          rawDesc = rawDesc.split(/Quoting/i)[0].trim();
        title = rawDesc
          .replace(/&lt;br\s*\/?&gt;/gi, " ")
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .replace(/https?:\/\/\S+/gi, "")
          .trim();
        if (title.length > 80) title = title.substring(0, 77) + "...";

        let statsText = $('p:contains("💬")').text() || "";
        if (!statsText) {
          try {
            const oembedLink =
              $('link[type="application/json+oembed"]').attr("href") || "";
            if (oembedLink) {
              const urlParams = new URLSearchParams(oembedLink.split("?")[1]);
              statsText = urlParams.get("text") || "";
            }
          } catch (e) {}
        }

        if (statsText) {
          stats = {
            comments: statsText.match(/💬\s*([\d.K]+)/)?.[1] || 0,
            shares: statsText.match(/[🔁🔄]\s*([\d.K]+)/)?.[1] || 0,
            likes: statsText.match(/[❤️♥️]\s*([\d.K]+)/)?.[1] || 0,
            views: statsText.match(/[👁️👀]\s*([\d.K]+)/)?.[1] || 0,
            duration: "---",
          };
        }

        const directVideo =
          $('meta[property="og:video:secure_url"]').attr("content") ||
          $('meta[property="og:video:url"]').attr("content") ||
          $('meta[property="og:video"]').attr("content") ||
          $('meta[name="twitter:player:stream"]').attr("content") ||
          $('meta[name="twitter:player"]').attr("content");
        const directImage =
          $('meta[property="og:image:secure_url"]').attr("content") ||
          $('meta[property="og:image:url"]').attr("content") ||
          $('meta[property="og:image"]').attr("content") ||
          $('meta[name="twitter:image"]').attr("content") ||
          $('meta[name="twitter:image:src"]').attr("content");

        mediaUrl = directVideo || directImage;
        thumbnail = directImage || "";
        isVideo = !!directVideo;

        if (mediaUrl) scrapeSuccess = true;
      } catch (e) {}
    }

    if (!scrapeSuccess || !mediaUrl) {
      return null;
    }

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: (title || "X Media") + (author ? ` (@${author})` : ""),
      stats,
      thumbnail,
      platform: isVideo ? "X / Twitter (Video)" : "X / Twitter (Image)",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: isVideo,
      extractor: "fx-scrape",
      directUrl: mediaUrl,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#1DA1F2")
      .setTitle(`${NOTIF} **X Signal Captured**`)
      .setThumbnail(thumbnail)
      .setDescription(
        `### ${LEA} **Transmission Identified**\n` +
          `${ARROW} **Author:** *${author}*\n` +
          `${ARROW} **Content:** *${title.length > 50 ? title.substring(0, 47) + "..." : title}*\n` +
          `${ARROW} **Type:** *X ${isVideo ? "Video/GIF" : "Image"}*\n\n` +
          `*Signal strength optimal. Commencing high-fidelity retrieval.*`,
      );

    await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: statusMsg };
  } catch (e) {
    console.error("[TWITTER-FLOW] Critical Error:", e.message);
    return null;
  }
}

module.exports = { runTwitterFlow };
