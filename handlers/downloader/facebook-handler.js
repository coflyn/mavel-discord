const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runFacebookFlow(target, url, options = {}) {
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
      .setColor("#6c5ce7")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "Meta Signal Matrix",
    "Bypassing security protocols...",
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
  } else {
    const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
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
      console.error("[FB-EDIT] Error:", e.message);
    }
  };

  try {
    const ddFbUrl = url
      .replace("facebook.com", "ddfacebook.com")
      .replace("fb.com", "ddfacebook.com")
      .replace("www.", "")
      .split("?")[0];
    const res = await axios.get(ddFbUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(res.data);
    const videoUrl =
      $('meta[property="og:video:secure_url"]').attr("content") ||
      $('meta[property="og:video:url"]').attr("content") ||
      $('meta[property="og:video"]').attr("content");
    const imageUrl =
      $('meta[property="og:image:secure_url"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $('meta[property="og:image"]').attr("content");
    const rawTitle =
      $('meta[property="og:title"]').attr("content") || "Facebook Media";
    const rawDesc =
      $('meta[property="og:description"]').attr("content") || "No description";

    let title = rawDesc.trim();
    title = title
      .split("\n")[0]
      .replace(/\d+.*(tayangan|tanggapan|views|comments|likes).*/gi, "")
      .trim();

    const author = rawTitle || "Unknown FB User";

    let stats = {
      likes: "---",
      views: "---",
      comments: "---",
      shares: "---",
      duration: "---",
    };
    const viewsMatch = rawDesc.match(/(\d+\s*rb|jt|\d+)\s+tayangan/i);
    const likesMatch = rawDesc.match(/(\d+\s*rb|jt|\d+)\s+tanggapan/i);
    if (viewsMatch)
      stats.views = viewsMatch[1].replace(" rb", "K").replace(" jt", "M");
    if (likesMatch)
      stats.likes = likesMatch[1].replace(" rb", "K").replace(" jt", "M");

    if (!videoUrl && !imageUrl) throw new Error("Video source restricted.");

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: title || author,
      stats: stats,
      thumbnail: imageUrl || "",
      platform: "Facebook",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: !!videoUrl,
      extractor: "facebook-scrape",
      directUrl: videoUrl || imageUrl,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${NOTIF} **FB Signal Decoded**`)
      .setThumbnail(imageUrl || "")
      .setDescription(
        `### ${LEA} **Media Source Retrieved**\n` +
          `${ARROW} **Resource:** *${title}*\n` +
          `${ARROW} **Type:** *${videoUrl ? "Video Stream" : "Static Insight"}*\n` +
          `${ARROW} **Author:** *${author}*\n\n` +
          `*Signal strength optimal. Commencing high-fidelity retrieval...*`,
      );

    const resMsg = await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    console.error("[FB-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runFacebookFlow };
