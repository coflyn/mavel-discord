const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runCloudFlow(target, url) {
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
      .setColor("#1e4d2b")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const platform = url.includes("mediafire.com")
    ? "Mediafire"
    : url.includes("drive.google.com")
      ? "GDrive"
      : "MEGA";
  const initialEmbed = getStatusEmbed(
    `${platform} Storage Hub`,
    "Secure link check in progress...",
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
      console.error("[CLOUD-EDIT] Error:", e.message);
    }
  };

  try {
    let title = "Resource Hub File";
    let directUrl = null;
    let jobId = Math.random().toString(36).substring(2, 10);
    let size = "---";

    if (platform === "Mediafire") {
      const res = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000,
      });
      const $ = cheerio.load(res.data);
      directUrl =
        $("a#downloadButton").attr("href") || $("a.input.popsok").attr("href");
      title =
        $(".dl-btn-label").text().trim() ||
        $(".filename").text().trim() ||
        "MF File";
    } else if (platform === "GDrive") {
      const fileIdMatch = url.match(
        /(?:\/d\/|id=|uc\?id=)([a-zA-Z0-9_-]{10,})/,
      );
      if (!fileIdMatch) throw new Error("Invalid GDrive URL.");
      const fileId = fileIdMatch[1];
      directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      title = "Google Drive File";
    } else if (platform === "MEGA") {
      const { File } = require("megajs");
      const file = File.fromURL(url);
      await file.loadAttributes();
      title = file.name || "MEGA File";
      size = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      directUrl = url;
    }

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: title,
      stats: {
        likes: "---",
        views: "---",
        comments: "---",
        shares: "---",
        duration: size,
        uploader: platform,
      },
      thumbnail: "",
      platform: platform,
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      hasVideo: false,
      extractor: platform.toLowerCase() + "-handler",
      directUrl: directUrl,
    };
    saveDB(db);

    const botUser = await target.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const CHEST = getEmoji("chest", "📦");
    const NOTIF = getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor("#000000")
      .setTitle(`${NOTIF} **Storage Signal Secured**`)
      .setDescription(
        `### ${CHEST} *Resource Hub Identified*\n` +
          `${ARROW} **Topic:** *${title}*\n` +
          `${ARROW} **Node:** *${platform}*\n` +
          `${ARROW} **Size:** *${size}*\n\n` +
          `*Detected via Cloud Scraper Engine*`,
      )
      .setFooter({
        text: "MaveL Cloud Resolver",
        iconURL: target.client.user.displayAvatarURL(),
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dl_cloud_${jobId}`)
        .setLabel("DOWNLOAD FILE")
        .setStyle(ButtonStyle.Success),
    );

    await editResponse({ embeds: [foundEmbed], components: [row] });
  } catch (e) {
    console.error("[CLOUD-FLOW] Error:", e.message);
    await editResponse({
      embeds: [
        getStatusEmbed(
          "Cloud Hub Extraction Failed",
          e.message || "Access blocked or link dead.",
        ),
      ],
    });
  }
}

module.exports = { runCloudFlow };
