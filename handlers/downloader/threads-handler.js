const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runThreadsFlow(target, url, options = {}) {
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
      .setColor("#1e4d2b")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "Threads Signal Matrix",
    "Decoding encrypted feed...",
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
      console.error("[THREADS-EDIT] Error:", e.message);
    }
  };

  try {
    const threadsBase = url.includes("/post/")
      ? `https://www.threads.net/t/${url.split("/post/")[1].split("?")[0]}/`
      : url.replace("threads.com", "threads.net").split("?")[0];

    let videoUrl, imageUrl, title, author;
    let stats = {
      likes: "---",
      views: "---",
      comments: "---",
      shares: "---",
      duration: "---",
    };

    const uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    ];

    let lastError = null;
    for (let i = 0; i < uas.length; i++) {
      if (videoUrl || imageUrl) break;
      const currentUA = uas[i];
      try {
        const res = await axios.get(threadsBase, {
          headers: {
            "User-Agent": currentUA,
            "Accept-Language": "en-US,en;q=0.9",
          },
          timeout: 10000,
        });

        if (res.data.includes("login_page") || res.data.includes("/login/")) {
          if (i === 0) {
            lastError =
              "Target localized behind security firewall. Retrying with bot UA.";
            continue;
          }
          throw new Error(
            "Target localized behind security firewall. Login required.",
          );
        }

        const $ = cheerio.load(res.data);

        if (i === 0) {
          const scripts = $(
            'script[type="application/json"], script:not([src])',
          );
          scripts.each((idx, el) => {
            const text = $(el).html();
            if (
              text &&
              (text.includes("image_versions2") || text.includes("display_url"))
            ) {
              const imgMatch = text.match(
                /"(https:\/\/[^"]+?\/[^"]+?\.(?:jpg|webp|png)[^"]*?)"/,
              );
              if (imgMatch && !imgMatch[1].includes("vignette") && !imageUrl) {
                const potential = imgMatch[1].replace(/\\u0026/g, "&");
                if (potential.includes("scontent")) {
                  imageUrl = potential;
                }
              }
            }
          });
        }

        const fetchedVideo =
          $('meta[property="og:video:secure_url"]').attr("content") ||
          $('meta[property="og:video:url"]').attr("content") ||
          $('meta[property="og:video"]').attr("content");
        const fetchedImage =
          $('meta[property="og:image:secure_url"]').attr("content") ||
          $('meta[property="og:image:url"]').attr("content") ||
          $('meta[property="og:image"]').attr("content");

        if (fetchedVideo) videoUrl = fetchedVideo;
        if (!imageUrl && fetchedImage) imageUrl = fetchedImage;

        const rawTitle = $('meta[property="og:title"]').attr("content");
        const rawDesc = $('meta[property="og:description"]').attr("content");

        if (rawTitle) {
          author = rawTitle.split(" (")[0];
          title = rawDesc || rawTitle;
        }

        if (rawDesc) {
          const commentsMatch = rawDesc.match(/([\d.K]+)\s*(Replies|Balasan)/i);
          const likesMatch = rawDesc.match(
            /([\d.K]+)\s*(Suka|Likes|Reactions)/i,
          );
          if (commentsMatch) stats.comments = commentsMatch[1];
          if (likesMatch) stats.likes = likesMatch[1];
        }
      } catch (e) {
        lastError = e.message;
        console.log(
          `[THREADS-SCRAPE] Attempt ${i + 1} failed with UA "${currentUA}":`,
          e.message,
        );
        continue;
      }
    }

    if (!videoUrl && !imageUrl) {
      const errorEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("🔒 Extraction Access Denied")
        .setDescription(
          `*Platforms security protocols have blocked unauthorized retrieval: ${lastError || "Signal Lost"}*`,
        );
      await editResponse({ embeds: [errorEmbed] });
      return { jobId: null, statusMsg };
    }

    let displayTitle = (title || "Threads Post").split("\n")[0].trim();
    displayTitle = displayTitle
      .replace(/[\d.K]+\s*(Replies|Balasan|Likes|Suka).*/gi, "")
      .replace(/See more photos and videos.*/gi, "")
      .trim();

    if (!displayTitle || displayTitle.length < 2) {
      displayTitle = author ? `${author}'s Post` : "Threads Media";
    }

    if (displayTitle.length > 80)
      displayTitle = displayTitle.substring(0, 77) + "...";

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url: threadsBase,
      timestamp: Date.now(),
      title: displayTitle + (author ? ` (@${author})` : ""),
      stats,
      thumbnail: imageUrl || "",
      platform: "Threads",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: !!videoUrl,
      extractor: "threads-scrape",
      directUrl: videoUrl || imageUrl,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setTitle(`${NOTIF} **Threads Handshake Secured**`)
      .setThumbnail(imageUrl || "")
      .setDescription(
        `### ${LEA} **Media Source Retrieved**\n` +
          `${ARROW} **Resource:** *${displayTitle}*\n` +
          `${ARROW} **Type:** *${videoUrl ? "Video Stream" : "Static Insight"}*\n` +
          `${ARROW} **Author:** *${author || "Threads User"}*\n\n` +
          `*Signal strength optimal. Initiating retrieval...*`,
      );

    const resMsg = await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    console.error("[THREADS-FLOW] Error:", e.message);
    return null;
  }
}

module.exports = { runThreadsFlow };
