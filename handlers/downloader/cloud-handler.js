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
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

const { startDownload } = require("./callbacks");

async function runCloudFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  const platform = url.includes("mediafire.com")
    ? "Mediafire"
    : url.includes("drive.google.com")
      ? "GDrive"
      : "MEGA";

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, `${platform} Cloud Storage`, "Looking for the link...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, `${platform} Cloud Storage`, "Looking for the link...");
  }

  try {
    let title = "Cloud File";
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
      .setColor("#636e72")
      .setTitle(`${NOTIF} **File Found**`)
      .setDescription(
        `### ${CHEST} *Link Found*\n` +
          `${ARROW} **File:** *${title}*\n` +
          `${ARROW} **Cloud:** *${platform}*\n` +
          `${ARROW} **Size:** *${size}*\n\n` +
          `*Found via MaveL Cloud*`,
      )
      .setFooter({
        text: "MaveL Cloud",
        iconURL: target.client.user.displayAvatarURL(),
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dl_cloud_${jobId}`)
        .setLabel("DOWNLOAD FILE")
        .setStyle(ButtonStyle.Success),
    );

    if (options.isCommand) {
      return await startDownload(target, jobId, "cloud", { statusMsg });
    }

    await _editResponse({ embeds: [foundEmbed], components: [row] });
  } catch (e) {
    console.error("[CLOUD-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Cloud Download Failed",
          e.message || "Access blocked or link dead.",
        ),
      ],
    });
  }
}

module.exports = { runCloudFlow };
