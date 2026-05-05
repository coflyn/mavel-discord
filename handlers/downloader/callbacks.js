const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const {
  getYtDlp,
  getFfmpegPath,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { bundleImagesToPdf } = require("../../utils/filetools");
const {
  loadDB,
  createProgressUpdater,
  safeUpdateStatus,
  formatNumber,
  formatSize,
  formatDuration,
  sanitizeFilename,
  downloadQueue,
  advanceLog,
} = require("./core-helpers");
const ffmpegStatic = require("ffmpeg-static");
const config = require("../../config");
const { getAssetUrl } = require("../../utils/tunnel-server");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed } = require("../../utils/response-helper");
const colors = require("../../utils/embed-colors");
const { File: MegaFile } = require("megajs");
let ffprobePath;
try {
  ffprobePath = require("ffprobe-static").path;
} catch (e) {
  ffprobePath = null;
}

function formatTitleForDisplay(title) {
  if (!title) return "Media Content";
  const clean = title
    .replace(/#\S+/g, "")
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{1F170}-\u{1F251}]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  const limit = 45;
  return clean.length > limit
    ? clean.substring(0, limit) + "..."
    : clean || "Media Content";
}

const getPlatformColor = (platform) => {
  if (!platform) return colors.CORE;
  const p = platform.toLowerCase();
  if (
    [
      "tiktok",
      "instagram",
      "x / twitter",
      "twitter",
      "facebook",
      "threads",
      "pinterest",
    ].some((s) => p.includes(s))
  )
    return colors.SOCIAL;
  if (
    ["spotify", "youtube", "ytm", "soundcloud", "bandcamp"].some((s) =>
      p.includes(s),
    )
  )
    return colors.MUSIC_DL;
  if (["scribd", "slideshare"].some((s) => p.includes(s)))
    return colors.DOCUMENT;
  if (p.includes("pixiv")) return colors.ARTWORK;
  if (
    ["mega", "mediafire", "gdrive", "google drive", "cloud"].some((s) =>
      p.includes(s),
    )
  )
    return colors.DOCUMENT;
  return colors.CORE;
};
const http = require("../../utils/http");
const NodeID3 = require("node-id3");
const { getTempDir } = require("../../utils/filetools");

async function startDownload(interaction, jobId, format, options = {}) {
  const botUser = await interaction.client.user.fetch();
  const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

  const resolution = options.resolution || "720";
  const statusMsg = options.statusMsg || null;
  const db = loadDB();
  let job = null;
  if (jobId) {
    job = db.jobs[jobId];
    if (!job) {
      const E_ERROR = resolveEmoji(interaction, "ping_red", "❌");
      const errorMsg = `${E_ERROR} *Error: Request expired.*`;
      const editResponse = async (data) => {
        try {
          if (interaction.editReply) return await interaction.editReply(data);
          const msg = statusMsg || interaction;
          if (msg.edit) return await msg.edit(data);
        } catch {}
      };
      return await editResponse({ content: errorMsg });
    }
  }

  const url = job ? job.url : options.url;
  const title = job ? job.title : options.title || "External File";
  const userMention = job?.userId ? `<@${job.userId}>` : "";

  const statusContent = `*Queued (${format.toUpperCase()}${format === "mp4" ? ` ${resolution}p` : ""})...*`;

  const cleanupStatus = async () => {
    setTimeout(async () => {
      try {
        if (statusMsg) {
          const msg =
            statusMsg.resource?.message || statusMsg.message || statusMsg;
          if (msg && typeof msg.delete === "function") {
            await msg.delete().catch(() => {});
          }
        }

        if (interaction && typeof interaction.deleteReply === "function") {
          await interaction.deleteReply().catch(() => {});
        }
      } catch (e) {
        // Silent
      }
    }, 1000);
  };

  const editLocal = async (data) => {
    try {
      const payload = typeof data === "string" ? { content: data } : data;

      if (interaction.isButton?.() && !statusMsg) {
        return await interaction.update(payload).catch(() => {});
      }

      if (interaction.editReply) {
        return await interaction.editReply(payload).catch(() => {});
      }

      const msg =
        statusMsg?.resource?.message ||
        statusMsg?.message ||
        statusMsg ||
        interaction;
      if (msg && typeof msg.edit === "function") {
        return await msg.edit(payload).catch(() => {});
      }
    } catch (e) {
      console.error("[EDIT-LOCAL] Error:", e.message);
    }
  };

  const guild = interaction.guild || interaction.client?.guilds?.cache.first();
  const getEmoji = (n, f) => resolveEmoji(guild, n, f);

  const ARROW = getEmoji("arrow", "»");
  const NOTIF = getEmoji("notif", "🔔");
  const CHECK = getEmoji("check", "✅");
  const LEA = getEmoji("lea", "🛰️");
  const FIRE = getEmoji("purple_fire", "🔥");
  const TIME = getEmoji("time", "⏳");
  const CHEST = getEmoji("chest", "📦");

  const platformColor = getPlatformColor(job?.platform || options.platform);

  const getStatus = (status, details) => {
    return getStatusEmbed(guild, status, details, platformColor).setDescription(
      `### ${FIRE} **${status}**\n${ARROW} **File:** *${title || "Searching..."}*\n${ARROW} **Info:** *${details}*`,
    );
  };

  await editLocal({
    content: "",
    embeds: [
      getStatus(
        "Queued",
        `Waiting for ${format.toUpperCase()} ${resolution}p...`,
      ),
    ],
    components: [],
  });

  const platformName = job?.platform || options.platform || "Media";
  if (interaction.client.setTempStatus) {
    interaction.client.setTempStatus(
      `Downloading ${platformName}...`,
      3,
      45000,
    );
  }

  downloadQueue.add(async () => {
    const tempDir = getTempDir();

    const sanitizedTitle = sanitizeFilename(title, "media");

    const outputBase = path.join(tempDir, `dl_${jobId || Date.now()}`);

    try {
      await editLocal({
        embeds: [getStatus("Downloading", "Getting things ready...")],
      });

      const updateProgress = createProgressUpdater(interaction, title);

      if (format === "twgallery") {
        const urls = job?.twUrls || job?.imageUrls || job?.allImages || [];
        if (urls.length === 0) throw new Error("No files found.");

        const platformName = job?.platform || options.platform || "X / Twitter";
        const progressPrefix = platformName;

        const photoPaths = [];
        for (let i = 0; i < urls.length; i++) {
          const photoUrl = urls[i];
          const photoPath = path.join(tempDir, `arch_${jobId}_${i}.jpg`);

          try {
            const isLocalFile =
              photoUrl.startsWith("/") ||
              photoUrl.startsWith("file://") ||
              fs.existsSync(photoUrl);

            if (isLocalFile) {
              const cleanLocalPath = photoUrl.replace("file://", "");
              if (fs.existsSync(cleanLocalPath)) {
                fs.copyFileSync(cleanLocalPath, photoPath);
              } else {
                console.error(
                  `[SYNC-LOCAL-FAIL] File missing: ${cleanLocalPath}`,
                );
                throw new Error(`Local resource not found: ${cleanLocalPath}`);
              }
            } else {
              const photoRes = await http.get(photoUrl, {
                responseType: "arraybuffer",
              });
              fs.writeFileSync(photoPath, photoRes.data);
            }
            photoPaths.push(photoPath);
          } catch (e) {
            console.error(`[SYNC-ERROR] Index ${i}:`, e.message);
            throw e;
          }
        }

        const isDocumentPlatform = [
          "Scribd",
          "SlideShare",
          "Academia",
          "Calaméo",
          "Komiku",
        ].includes(platformName);
        const shouldBundle =
          photoPaths.length > 10 ||
          (isDocumentPlatform && photoPaths.length > 1);
        let pdfPath = null;
        let attachments = [];

        const sizeGall = photoPaths.reduce(
          (acc, p) => acc + (fs.existsSync(p) ? fs.statSync(p).size : 0),
          0,
        );

        if (shouldBundle) {
          const rawPdf = await bundleImagesToPdf(photoPaths);
          photoPaths.forEach((p) => p && fs.existsSync(p) && fs.unlinkSync(p));

          pdfPath = path.join(
            tempDir,
            `${sanitizedTitle}_${jobId || Date.now()}.pdf`,
          );
          if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);

          attachments = [
            new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
          ];
        } else {
          attachments = photoPaths.map((p, idx) => {
            const ext = p.split(".").pop();
            return new AttachmentBuilder(p, {
              name: `${sanitizedTitle}_${idx + 1}.${ext}`,
            });
          });
        }

        const doneEmbed = new EmbedBuilder()
          .setColor(getPlatformColor(platformName))
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner);

        if (
          job?.thumbnail &&
          typeof job?.thumbnail === "string" &&
          job?.thumbnail.startsWith("http")
        ) {
          doneEmbed.setThumbnail(job?.thumbnail);
        }

        doneEmbed.setDescription(
          (userMention ? `${userMention}\n\n` : "") +
            `${LEA} **Your media is ready**\n` +
            `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
            `${ARROW} **Platform:** *${shouldBundle ? (isDocumentPlatform ? "PDF File" : "Image Gallery") : "Ready to save"}*\n` +
            `${ARROW} **Source:** *${platformName}*\n` +
            `${ARROW} **Files:** *${urls.length} Images*\n` +
            `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
            (() => {
              const s = job?.stats || {};
              const parts = [];
              const l = formatNumber(s.likes || 0);
              const c = formatNumber(s.comments || 0);
              const v = formatNumber(s.views || 0);
              if (l !== "0") parts.push(`${l} Likes`);
              if (c !== "0") parts.push(`${c} Comments`);
              if (v !== "0") parts.push(`${v} Views`);
              return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
            })(),
        );

        doneEmbed.setFooter({
          text: `MaveL Downloader (Total: ${formatSize(sizeGall)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
          iconURL: interaction.client.user.displayAvatarURL(),
        });

        const totalSize = shouldBundle
          ? pdfPath && fs.existsSync(pdfPath)
            ? fs.statSync(pdfPath).size
            : sizeGall
          : sizeGall;

        const limitMB = 25;

        if (totalSize > limitMB * 1024 * 1024) {
          if (!pdfPath) {
            const rawPdf = await bundleImagesToPdf(photoPaths);
            pdfPath = path.join(tempDir, `${sanitizedTitle}_${jobId || Date.now()}.pdf`);
            if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);
          }
          const mainFile = pdfPath;
          const publicUrl = getAssetUrl(path.basename(mainFile));
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            const PING_GREEN =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "check")
                ?.toString() || "🟢";
            const embedTitle = (shouldBundle || totalSize > limitMB * 1024 * 1024)
              ? "Gallery PDF Archive"
              : "Media Gallery Link";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **${embedTitle}**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(totalSize)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[${PING_GREEN} CLICK TO DOWNLOAD BUNDLE](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            doneEmbed.setImage(null);
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            await cleanupStatus();
            if (interaction.deleteReply)
              await interaction.deleteReply().catch(() => {});
            setTimeout(() => {
              if (pdfPath && fs.existsSync(pdfPath)) {
                try { fs.unlinkSync(pdfPath); } catch (e) {}
              }
            }, 600000);
            photoPaths.forEach((p) => {
              if (p && fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch (e) {}
              }
            });
            return;
          }
        }

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: attachments,
        });
        await finalMsg.react(CHECK).catch(() => {});

        await cleanupStatus();
        photoPaths.forEach((p) => {
          if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (e) {}
          }
        });
        if (pdfPath && fs.existsSync(pdfPath)) {
          try { fs.unlinkSync(pdfPath); } catch (e) {}
        }
        if (interaction.deleteReply)
          await interaction.deleteReply().catch(() => {});

        await advanceLog(interaction.client, {
          title: "Download Success (Gallery)",
          color: parseInt(platformColor.replace("#", ""), 16),
          message: `Delivered ${urls.length} files.`,
          user:
            (interaction.user || interaction.author || {}).tag ||
            "Unknown User",
          platform: platformName,
          url: url,
          size: formatSize(sizeGall),
        });

        return;
      }

      if (format === "tkgallery") {
        const urls = job?.images || [];
        if (urls.length === 0) throw new Error("No photos found.");

        const photoPaths = [];
        for (let i = 0; i < urls.length; i++) {
          const photoUrl = urls[i];
          const photoPath = path.join(tempDir, `tk_${jobId}_${i}.jpg`);

          await editLocal({
            embeds: [
              getStatus(
                "Downloading",
                `Getting photo ${i + 1} of ${urls.length}...`,
              ),
            ],
          });

          const photoRes = await http.get(photoUrl, {
            responseType: "arraybuffer",
            headers: { Referer: "https://www.tikwm.com/" },
            timeout: 20000,
          });
          fs.writeFileSync(photoPath, photoRes.data);
          photoPaths.push(photoPath);
        }

        const shouldBundle = photoPaths.length > 10;
        let pdfPath = null;
        let attachments = [];

        const sizeGallTK = photoPaths.reduce(
          (acc, p) => acc + (fs.existsSync(p) ? fs.statSync(p).size : 0),
          0,
        );

        if (shouldBundle) {
          await editLocal({
            content: "",
          });
          const rawPdf = await bundleImagesToPdf(photoPaths);
          photoPaths.forEach((p) => p && fs.existsSync(p) && fs.unlinkSync(p));

          pdfPath = path.join(
            tempDir,
            `${sanitizedTitle}_${jobId || Date.now()}.pdf`,
          );
          if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);

          attachments = [
            new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
          ];
        } else {
          attachments = photoPaths.map(
            (p, idx) =>
              new AttachmentBuilder(p, {
                name: `${sanitizedTitle}_${idx + 1}.jpg`,
              }),
          );
        }

        const doneEmbed = new EmbedBuilder()
          .setColor(colors.SOCIAL)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **Your media is ready**\n` +
              `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
              `${ARROW} **Platform:** *TikTok (${shouldBundle ? "PDF Bundle" : "Direct Photos"})*\n` +
              `${ARROW} **Source:** *${job?.platform || options.platform || "TikTok"}*\n` +
              `${ARROW} **Pages:** *${urls.length} Photos*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
              (() => {
                const s = job?.stats || {};
                const parts = [];
                const l = formatNumber(s.likes || 0);
                const c = formatNumber(s.comments || 0);
                const v = formatNumber(s.views || 0);
                if (l !== "0") parts.push(`${l} Likes`);
                if (c !== "0") parts.push(`${c} Comments`);
                if (v !== "0") parts.push(`${v} Views`);
                return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
              })(),
          )
          .setFooter({
            text: `MaveL Downloader (Total: ${formatSize(sizeGallTK)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const totalSize = shouldBundle
          ? pdfPath && fs.existsSync(pdfPath)
            ? fs.statSync(pdfPath).size
            : sizeGallTK
          : sizeGallTK;

        const limitMB = 25;
        if (totalSize > limitMB * 1024 * 1024) {
          if (!pdfPath) {
            const rawPdf = await bundleImagesToPdf(photoPaths);
            pdfPath = path.join(tempDir, `${sanitizedTitle}_${jobId || Date.now()}.pdf`);
            if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);
          }
          const mainFile = pdfPath;
          const publicUrl = getAssetUrl(path.basename(mainFile));
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            const PING_GREEN =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "check")
                ?.toString() || "🟢";
            const embedTitle = (shouldBundle || totalSize > limitMB * 1024 * 1024)
              ? "Gallery PDF Archive"
              : "Media Gallery Link";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **${embedTitle}**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(totalSize)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[${PING_GREEN} CLICK TO DOWNLOAD BUNDLE](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            doneEmbed.setImage(null);
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            setTimeout(() => {
              if (pdfPath && fs.existsSync(pdfPath)) {
                try { fs.unlinkSync(pdfPath); } catch (e) {}
              }
            }, 600000);
            photoPaths.forEach((p) => {
              if (p && fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch (e) {}
              }
            });
            return;
          }
        }

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: attachments,
        });
        await finalMsg.react(CHECK).catch(() => {});

        await cleanupStatus();

        photoPaths.forEach((p) => {
          if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (e) {}
          }
        });
        if (pdfPath && fs.existsSync(pdfPath)) {
          try { fs.unlinkSync(pdfPath); } catch (e) {}
        }
        if (interaction.deleteReply)
          await interaction.deleteReply().catch(() => {});

        await advanceLog(interaction.client, {
          title: "Download Success (TK Gallery)",
          color: parseInt(platformColor.replace("#", ""), 16),
          message: `Delivered ${urls.length} photos.`,
          user:
            (interaction.user || interaction.author || {}).tag ||
            "Unknown User",
          platform: "TikTok",
          url: url,
          size: formatSize(sizeGallTK),
        });

        return;
      }

      const foundUrl = job?.directUrl || options.url;
      if (
        format === "tkmp4" ||
        format === "tkmp3" ||
        job?.extractor === "threads-scrape" ||
        (job?.extractor === "fx-scrape" && !foundUrl?.includes("twimg.com")) ||
        (job?.extractor === "facebook-scrape" &&
          !foundUrl?.includes("fbcdn.net"))
      ) {
        const directUrl = foundUrl;
        if (!directUrl) throw new Error("Source stream lost.");

        let ext =
          format === "tkmp3"
            ? "mp3"
            : job?.isVideo || job?.hasVideo
              ? "mp4"
              : "jpg";
        if (directUrl.includes(".png")) ext = "png";

        const outputFile = path.join(
          tempDir,
          `meta_${jobId || "direct"}.${ext}`,
        );

        try {
          const res = await http.get(directUrl, {
            responseType: "arraybuffer",
            headers: {
              Referer: directUrl.includes("twimg.com")
                ? "https://x.com/"
                : "https://www.google.com/",
            },
            maxRedirects: 10,
            timeout: 60000,
          });

          if (!res.data || res.data.length < 5000) {
            const sample = res.data?.toString().substring(0, 100) || "";
            if (sample.includes("<html") || sample.includes("<!DOCTYPE")) {
            } else {
              fs.writeFileSync(outputFile, res.data);
            }
          } else {
            fs.writeFileSync(outputFile, res.data);
          }
        } catch (axiosErr) {
          console.warn(`[TK-AXIOS-FAIL] ${directUrl}:`, axiosErr.message);
        }

        if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 10000) {
          const stats = fs.statSync(outputFile);
          const limitMB = 25;

          if (stats.size > limitMB * 1024 * 1024) {
            const publicUrl = getAssetUrl(path.basename(outputFile));
            if (publicUrl) {
              const DIAMOND =
                guild.emojis.cache
                  .find((e) => e.name === "diamond")
                  ?.toString() || "💎";
              const doneEmbed = new EmbedBuilder()
                .setColor(platformColor)
                .setAuthor({
                  name: "MaveL Downloads",
                  iconURL: interaction.client.user.displayAvatarURL(),
                })
                .setTitle(`${NOTIF} **Media Link Ready**`)
                .setThumbnail(job?.thumbnail || "")
                .setImage(botBanner)
                .setDescription(
                  (userMention ? `${userMention}\n\n` : "") +
                    `### ${DIAMOND} **File Too Large for Discord**\n` +
                    `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                    `${ARROW} **Size:** *${formatSize(stats.size)}*\n` +
                    `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                    `${ARROW} **[DOWNLOAD HD VIDEO](${publicUrl})**\n\n` +
                    `*Local host link expires in 10 minutes.*`,
                );
              const finalMsg = await interaction.channel.send({
                embeds: [doneEmbed],
              });
              await finalMsg.react(CHECK).catch(() => {});
              await cleanupStatus();
              if (interaction.deleteReply)
                await interaction.deleteReply().catch(() => {});

              setTimeout(() => {
                if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
              }, 600000);
              return;
            }
          }

          const attachment = new AttachmentBuilder(outputFile, {
            name: `${sanitizedTitle}.${ext}`,
          });

          const doneEmbed = new EmbedBuilder()
            .setColor(platformColor)
            .setAuthor({
              name: "MaveL Downloads",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Ready!**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Your media is ready**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Type:** *${job?.isVideo || job?.hasVideo ? "Video Stream" : "Static Image"}*\n` +
                `${ARROW} **Platform:** *${job?.platform || options.platform || "TikTok"}*\n` +
                `${ARROW} **Length:** *${job?.stats?.duration || "---"}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                (() => {
                  const s = job?.stats || {};
                  const parts = [];
                  const l = formatNumber(s.likes || 0);
                  const c = formatNumber(s.comments || 0);
                  const v = formatNumber(s.views || 0);
                  if (l !== "0") parts.push(`${l} Likes`);
                  if (c !== "0") parts.push(`${c} Comments`);
                  if (v !== "0") parts.push(`${v} Views`);
                  return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
                })(),
            )
            .setFooter({
              text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          const finalMsg = await interaction.channel.send({
            content: "",
            embeds: [doneEmbed],
            files: [attachment],
          });
          await finalMsg.react(CHECK).catch(() => {});
          await cleanupStatus();
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        } else {
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        }
      }

      if (format === "cloud") {
        const directUrl = job?.directUrl || options.url;
        const platform = job?.platform || options.platform || "Platform";
        const outputFile = path.join(
          tempDir,
          job?.title
            ? `${job.title.replace(/[^\w\s-]/gi, "")}.pdf`
            : `cloud_${jobId || "direct"}.pdf`,
        );

        if (platform === "MEGA") {
          const file = MegaFile.fromURL(url);
          await file.loadAttributes();

          await new Promise((resolve, reject) => {
            const stream = file.download();
            const writer = fs.createWriteStream(outputFile);
            stream.pipe(writer);
            stream.on("error", reject);
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
        } else if (fs.existsSync(directUrl)) {
          fs.copyFileSync(directUrl, outputFile);
          const res = await http.get(directUrl, {
            responseType: "arraybuffer",
            uaType: "bot",
            maxRedirects: 5,
          });
          fs.writeFileSync(outputFile, res.data);
        }

        const attachment = new AttachmentBuilder(outputFile);

        const doneEmbed = new EmbedBuilder()
          .setColor(colors.DOCUMENT)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **File Found Successfully**\n` +
              `${ARROW} **Title:** *${job?.title || options.title || "External File"}*\n` +
              `${ARROW} **Platform:** *Cloud Document*\n` +
              `${ARROW} **Source:** *${platform}*\n` +
              `${ARROW} **Length:** *---*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)`,
          )
          .setFooter({
            text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const stats = fs.statSync(outputFile);
        const limitMB = 25;

        if (stats.size > limitMB * 1024 * 1024) {
          const publicUrl = getAssetUrl(path.basename(outputFile));
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **Cloud File Too Large**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(stats.size)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[DOWNLOAD FILE](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            await cleanupStatus();
            if (interaction.deleteReply)
              await interaction.deleteReply().catch(() => {});

            setTimeout(() => {
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            }, 600000);
            return;
          }
        }

        if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 10000) {
          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: [attachment],
          });
          await finalMsg.react(CHECK).catch(() => {});
          await cleanupStatus();
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        } else {
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        }
      }

      if (format === "spmp3") {
        const query = job?.searchQuery || options.query || "Query";
        const outputFile = path.join(tempDir, `spotify_${jobId}.mp3`);

        await editLocal({
          content: "",
        });

        const spArgs = [
          `ytsearch1:${query}`,
          "-x",
          "--audio-format",
          "mp3",
          "--embed-thumbnail",
          "--add-metadata",
          "-o",
          outputFile,
          ...getJsRuntimeArgs(),
          ...getCookiesArgs(
            job?.platform?.toLowerCase().includes("twitter") ||
              job?.platform?.toLowerCase().includes("x / twitter")
              ? "twitter"
              : job?.platform?.toLowerCase().includes("facebook")
                ? "facebook"
                : job?.platform?.toLowerCase().includes("instagram")
                  ? "instagram"
                  : "",
          ),
          ...getVpsArgs(),
        ];

        const spProc = spawn(getYtDlp(), spArgs, { env: getDlpEnv() });
        await new Promise((r) => spProc.on("close", r));

        if (!fs.existsSync(outputFile))
          throw new Error("Could not find the song.");

        const attachment = new AttachmentBuilder(outputFile, {
          name: `${sanitizedTitle}.mp3`,
        });

        const doneEmbed = new EmbedBuilder()
          .setColor(colors.MUSIC_DL)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **Your media is ready**\n` +
              `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
              `${ARROW} **Platform:** *High-Fidelity Audio*\n` +
              `${ARROW} **Source:** *Spotify (Resolved)*\n` +
              `${ARROW} **Length:** *Track*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)`,
          )
          .setFooter({
            text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const stats = fs.statSync(outputFile);
        const limitMB = 25;

        if (stats.size > limitMB * 1024 * 1024) {
          const publicUrl = getAssetUrl(path.basename(outputFile));
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            const PING_GREEN =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "check")
                ?.toString() || "🟢";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **Audio File Too Large**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(stats.size)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[${PING_GREEN} DOWNLOAD MUSIC](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            await cleanupStatus();
            if (interaction.deleteReply)
              await interaction.deleteReply().catch(() => {});

            setTimeout(() => {
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            }, 600000);
            return;
          }
        }

        if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 10000) {
          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: [attachment],
          });
          await finalMsg.react(CHECK).catch(() => {});
          await cleanupStatus();
          const finalSize = fs.existsSync(outputFile)
            ? fs.statSync(outputFile).size
            : 0;
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});

          await advanceLog(interaction.client, {
            title: "Download Success (Spotify)",
            color: parseInt(colors.MUSIC_DL.replace("#", ""), 16),
            message: `Delivered audio file.`,
            user:
              (interaction.user || interaction.author || {}).tag ||
              "Unknown User",
            platform: "Spotify",
            url: url,
            size: formatSize(finalSize),
          });

          return;
        } else {
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        }
      }

      if (format === "pixiv_gallery") {
        const urls = job?.pixivUrls || options.urls || [];
        if (urls.length === 0) throw new Error("Artwork data lost.");

        const photoPaths = [];
        for (let i = 0; i < urls.length; i++) {
          const photoUrl = urls[i];
          const photoPath = path.join(tempDir, `pixiv_${jobId}_${i}.jpg`);

          await editLocal({
            embeds: [
              getStatus(
                "Downloading",
                `Getting page ${i + 1} of ${urls.length}...`,
              ),
            ],
          });

          const photoRes = await http.get(photoUrl, {
            responseType: "arraybuffer",
            headers: { Referer: "https://www.pixiv.net/" },
            timeout: 30000,
          });
          fs.writeFileSync(photoPath, photoRes.data);
          photoPaths.push(photoPath);
        }

        const shouldBundle = photoPaths.length > 10;
        let pdfPath = null;
        let attachments = [];

        const totalSizeSize = photoPaths.reduce(
          (acc, p) => acc + (fs.existsSync(p) ? fs.statSync(p).size : 0),
          0,
        );

        if (shouldBundle) {
          await editLocal({
            content: `${CHEST} **Bundling pages into PDF document...**`,
          });
          const rawPdf = await bundleImagesToPdf(photoPaths);
          photoPaths.forEach((p) => p && fs.existsSync(p) && fs.unlinkSync(p));

          pdfPath = path.join(
            tempDir,
            `${sanitizedTitle}_${jobId || Date.now()}.pdf`,
          );
          if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);

          attachments = [
            new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
          ];
        } else {
          attachments = photoPaths.map(
            (p, idx) =>
              new AttachmentBuilder(p, {
                name: `${sanitizedTitle}_${idx + 1}.jpg`,
              }),
          );
        }

        const doneEmbed = new EmbedBuilder()
          .setColor(colors.ARTWORK)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **Your media is ready**\n` +
              `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
              `${ARROW} **Platform:** *Pixiv (${shouldBundle ? "PDF Bundle" : "Direct Photos"})*\n` +
              `${ARROW} **Source:** *Pixiv (Archive)*\n` +
              `${ARROW} **Pages:** *${urls.length} Compiled*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)`,
          )
          .setFooter({
            text: `MaveL Downloader (Total: ${formatSize(totalSizeSize)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const totalSize =
          pdfPath && fs.existsSync(pdfPath)
            ? fs.statSync(pdfPath).size
            : totalSizeSize;

        const limitMB = 25;

        if (totalSize > limitMB * 1024 * 1024) {
          if (!pdfPath) {
            const rawPdf = await bundleImagesToPdf(photoPaths);
            pdfPath = path.join(tempDir, `${sanitizedTitle}_${jobId || Date.now()}.pdf`);
            if (fs.existsSync(rawPdf)) fs.renameSync(rawPdf, pdfPath);
          }
          const mainFile = pdfPath;
          const publicUrl = getAssetUrl(path.basename(mainFile));

          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            const PING_GREEN =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "check")
                ?.toString() || "🟢";
            const embedTitle = (shouldBundle || totalSize > limitMB * 1024 * 1024)
              ? "Pixiv PDF Archive"
              : "Pixiv Gallery Link";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **${embedTitle}**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(totalSize)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[${PING_GREEN} CLICK TO DOWNLOAD BUNDLE](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            doneEmbed.setImage(null);

            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            setTimeout(() => {
              if (pdfPath && fs.existsSync(pdfPath)) {
                try { fs.unlinkSync(pdfPath); } catch (e) {}
              }
            }, 600000);
            photoPaths.forEach((p) => {
              if (p && fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch (e) {}
              }
            });
            return;
          }
        }

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: attachments,
        });
        await finalMsg.react(CHECK).catch(() => {});

        await cleanupStatus();
        photoPaths.forEach((p) => {
          if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (e) {}
          }
        });
        if (pdfPath && fs.existsSync(pdfPath)) {
          try { fs.unlinkSync(pdfPath); } catch (e) {}
        }
        if (interaction.deleteReply)
          await interaction.deleteReply().catch(() => {});
        return;
      }

      if (format === "pixiv_ugoira") {
        const directUrl = job?.pixivUrls ? job.pixivUrls[0] : options.url;
        const outputFile = path.join(tempDir, `pixiv_${jobId}.mp4`);

        await editLocal({
          embeds: [getStatus("Downloading", "Getting the video...")],
        });
        const videoRes = await http.get(directUrl, {
          responseType: "arraybuffer",
          headers: { Referer: "https://www.pixiv.net/" },
          timeout: 60000,
        });
        fs.writeFileSync(outputFile, videoRes.data);

        const attachment = new AttachmentBuilder(outputFile, {
          name: `pixiv_${jobId}.mp4`,
        });

        const doneEmbed = new EmbedBuilder()
          .setColor(colors.ARTWORK)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner)
          .setDescription(
            `${LEA} **Your media is ready**\n` +
              `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
              `${ARROW} **Platform:** *Pixiv Animation*\n` +
              `${ARROW} **Source:** *Pixiv (Ugoira)*\n` +
              `${ARROW} **Length:** *Animated*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)`,
          )
          .setFooter({
            text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const stats = fs.statSync(outputFile);
        const limitMB = 25;

        if (stats.size > limitMB * 1024 * 1024) {
          const publicUrl = getAssetUrl(path.basename(outputFile));
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **Pixiv Animation Too Large**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(stats.size)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[DOWNLOAD UGOIRA VIDEO](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            await cleanupStatus();
            if (interaction.deleteReply)
              await interaction.deleteReply().catch(() => {});

            setTimeout(() => {
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            }, 600000);
            return;
          }
        }

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: [attachment],
        });
        await finalMsg.react(CHECK).catch(() => {});
        await cleanupStatus();
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        if (interaction.deleteReply)
          await interaction.deleteReply().catch(() => {});
        return;
      }

      if (format === "gallery") {
        const galleryArgs = [
          "--dump-json",
          ...getJsRuntimeArgs(),
          ...getCookiesArgs(
            job?.platform?.toLowerCase().includes("twitter") ||
              job?.platform?.toLowerCase().includes("x / twitter")
              ? "twitter"
              : job?.platform?.toLowerCase().includes("facebook")
                ? "facebook"
                : job?.platform?.toLowerCase().includes("instagram")
                  ? "instagram"
                  : "",
          ),
          ...getVpsArgs(),
          url,
        ];
        if (!url.includes("instagram.com")) {
          galleryArgs.splice(1, 0, "--no-playlist");
        }

        const metaProc = spawn(getYtDlp(), galleryArgs, { env: getDlpEnv() });
        let metaOut = "";
        metaProc.stdout.on("data", (d) => (metaOut += d));
        await new Promise((r) => metaProc.on("close", r));

        let json;
        try {
          json = JSON.parse(metaOut);
        } catch (err) {
          throw new Error(
            "Failed to extract photo data for this link. Instagram often blocks external extraction for photo posts.",
          );
        }

        const entries = json.entries || (json.url ? [json] : []);
        if (entries.length === 0) throw new Error("No photos found.");

        await editLocal({
          content: "",
        });
        const photoPaths = [];
        for (let i = 0; i < entries.length; i++) {
          const photoUrl = entries[i].url;
          const photoPath = path.join(
            tempDir,
            `photo_${sanitizedTitle}_${i}.jpg`,
          );
          const dlPhoto = spawn("curl", [
            "-s",
            "-L",
            "-o",
            photoPath,
            photoUrl,
          ]);
          await new Promise((r) => dlPhoto.on("close", r));
          if (fs.existsSync(photoPath)) photoPaths.push(photoPath);
        }

        const audioPath = path.join(tempDir, `audio_${sanitizedTitle}.mp3`);
        const dlAudio = spawn(
          getYtDlp(),
          [
            "-f",
            "ba/best",
            "-x",
            "--audio-format",
            "mp3",
            ...getJsRuntimeArgs(),
            ...getCookiesArgs(
              job?.platform?.toLowerCase().includes("twitter") ||
                job?.platform?.toLowerCase().includes("x / twitter")
                ? "twitter"
                : job?.platform?.toLowerCase().includes("facebook")
                  ? "facebook"
                  : job?.platform?.toLowerCase().includes("instagram")
                    ? "instagram"
                    : "",
            ),
            ...getVpsArgs(),
            "-o",
            audioPath,
            url,
          ],
          { env: getDlpEnv() },
        );
        await new Promise((r) => dlAudio.on("close", r));

        const attachments = photoPaths.map((p) => new AttachmentBuilder(p));
        if (fs.existsSync(audioPath))
          attachments.push(new AttachmentBuilder(audioPath));

        const { likes, comments, shares, views, duration, uploader } =
          job?.stats || {
            likes: "0",
            comments: "0",
            shares: "0",
            views: "0",
            duration: "",
            uploader: "",
          };

        const doneEmbed = new EmbedBuilder()
          .setColor(platformColor)
          .setAuthor({
            name: "MaveL Downloads",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Ready!**`)
          .setThumbnail(job?.thumbnail || "")
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **Your media is ready**\n` +
              `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
              `${ARROW} **Platform:** *Gallery Album*\n` +
              `${ARROW} **Source:** *${uploader || "System"}*\n` +
              `${ARROW} **Length:** *---*\n` +
              `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
              (() => {
                const parts = [];
                const l = formatNumber(likes || 0);
                const c = formatNumber(comments || 0);
                const v = formatNumber(views || 0);
                if (l !== "0") parts.push(`${l} Likes`);
                if (c !== "0") parts.push(`${c} Comments`);
                if (v !== "0") parts.push(`${v} Views`);
                return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
              })(),
          )
          .setFooter({
            text: `MaveL Downloader (${formatSize(photoPaths.reduce((acc, p) => acc + fs.statSync(p).size, 0))}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          });

        const totalSize =
          photoPaths.reduce(
            (acc, p) => acc + (fs.existsSync(p) ? fs.statSync(p).size : 0),
            0,
          ) + (fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0);
        const limitMB = 25;

        if (totalSize > limitMB * 1024 * 1024) {
          const publicUrl = getAssetUrl(
            path.basename(photoPaths[0] || audioPath),
          );
          if (publicUrl) {
            const DIAMOND =
              interaction.guild?.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";
            doneEmbed.setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **Social Gallery Too Large**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${formatSize(totalSize)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[DOWNLOAD GALLERY ASSETS](${publicUrl})**\n\n` +
                `*Local storage link expires in 10 minutes.*`,
            );
            const finalMsg = await interaction.channel.send({
              embeds: [doneEmbed],
            });
            await finalMsg.react(CHECK).catch(() => {});
            await cleanupStatus();
            if (interaction.deleteReply)
              await interaction.deleteReply().catch(() => {});

            setTimeout(() => {
              photoPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
              if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }, 600000);
            return;
          }
        }

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: attachments,
        });
        await finalMsg.react(CHECK).catch(() => {});
        await cleanupStatus();
        photoPaths.forEach((p) => fs.unlinkSync(p));
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        return;
      }

      const outputFile =
        format === "photo"
          ? `${outputBase}.jpg`
          : format === "mp4"
            ? `${outputBase}.mp4`
            : `${outputBase}.mp3`;
      const ua = http.getUserAgent("desktop");
      const referer =
        job?.referer ||
        (url.includes("tiktok.com")
          ? "https://www.tiktok.com/"
          : url.includes("instagram.com")
            ? "https://www.instagram.com/"
            : url.includes("twitter.com") || url.includes("x.com")
              ? "https://x.com/"
              : "https://www.google.com/");

      const ffmpegBin = getFfmpegPath();
      const ffmpegDir = path.dirname(ffmpegBin);
      const ffprobeBinary =
        ffprobePath || ffmpegBin.replace("ffmpeg", "ffprobe");

      const dlArgs =
        format === "mp4"
          ? [
              "-f",
              job?.directUrl
                ? "best[ext=mp4]/best"
                : `bv*[height<=${resolution}]+ba/b[height<=${resolution}] / best[height<=${resolution}] / best`,
              "--no-playlist",
              "--newline",
              "--no-check-certificate",
              "--embed-metadata",
              "--embed-thumbnail",
              "--socket-timeout",
              "30",
              "--retries",
              "10",
              ...getJsRuntimeArgs(),
              ...getCookiesArgs(),
              ...getVpsArgs(),
              "--ffmpeg-location",
              binDir,
              "--user-agent",
              ua,
              "--referer",
              referer,
              "--add-header",
              "Sec-Fetch-Mode:navigate",
              "--add-header",
              "Sec-Fetch-Site:same-origin",
              "--add-header",
              "Sec-Fetch-Dest:document",
              ...(job?.headers
                ? Object.entries(job.headers).flatMap(([k, v]) => [
                    "--add-header",
                    `${k}:${v}`,
                  ])
                : []),
              "--merge-output-format",
              "mp4",
              "-o",
              outputFile,
              (url.includes("twitter.com") || url.includes("x.com")) &&
              !job?.directUrl
                ? url
                : job?.directUrl || url,
            ].filter(Boolean)
          : format === "photo"
            ? [
                "--skip-download",
                "--write-thumbnail",
                "--convert-thumbnails",
                "jpg",
                "-o",
                outputBase,
                job?.directUrl || url,
              ]
            : [
                "-f",
                "ba/best",
                "-x",
                "--audio-format",
                "mp3",
                "--no-playlist",
                "--newline",
                "--embed-metadata",
                "--embed-thumbnail",
                "--socket-timeout",
                "30",
                "--retries",
                "10",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
                `--ffmpeg-location=${ffmpegDir}`,
                "--user-agent",
                ua,
                "--referer",
                referer,
                "--add-header",
                "Sec-Fetch-Mode:navigate",
                "--add-header",
                "Sec-Fetch-Site:same-origin",
                "--add-header",
                "Sec-Fetch-Dest:document",
                "-o",
                outputFile,
                (url.includes("twitter.com") || url.includes("x.com")) &&
                !job?.directUrl
                  ? url
                  : job?.directUrl || url,
              ].filter(Boolean);

      const skipAxiosPlatforms = [
        "instagram",
        "facebook",
        "youtube",
        "ytm",
        "twitter",
        "x",
        "pornhub",
      ];
      const isSkipPlatform =
        skipAxiosPlatforms.some((p) =>
          job?.platform?.toLowerCase().includes(p),
        ) &&
        job?.hasVideo &&
        !(job?.platform?.toLowerCase().includes("instagram") && job?.directUrl);

      const isHls =
        job?.isHls ||
        (typeof job?.directUrl === "string" && job.directUrl.includes(".m3u8"));

      let stdoutOutput = "";
      let stderrOutput = "";

      console.log(
        `[DL-CALLBACK] format: ${format}, isSkip: ${isSkipPlatform}, hasDirectUrl: ${!!job?.directUrl}, platform: ${job?.platform}`,
      );
      const directUrl = job?.directUrl || options.url;

      if (typeof directUrl === "string" && fs.existsSync(directUrl)) {
        await editLocal({ content: "" });
        fs.copyFileSync(directUrl, outputFile);
      } else if (
        job?.directUrl &&
        (format === "mp4" || format === "photo") &&
        !isSkipPlatform &&
        !isHls
      ) {
        await editLocal({
          content: "",
        });
        try {
          const response = await http.request({
            method: "get",
            url: directUrl,
            responseType: "stream",
            headers: {
              Referer: referer,
              ...(job?.headers || {}),
            },
            timeout: 300000,
          });

          const totalSize = parseInt(response.headers["content-length"], 10);
          let downloadedSize = 0;
          const writer = fs.createWriteStream(outputFile);

          response.data.on("data", (chunk) => {
            downloadedSize += chunk.length;
          });

          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
        } catch (e) {
          console.error("[AXIOS-DL] Error:", e.message);
          throw new Error(`Download failed: ${e.message}`);
        }
      } else if (isHls && job?.directUrl) {
        await editLocal({ content: "" });
        const cookiesStr = job?.headers?.Cookie || "";
        console.log(`[HLS-DL] Target: ${directUrl}`);
        console.log(`[HLS-DL] Referer: ${referer}`);

        const ffmpegArgs = [
          "-headers",
          `User-Agent: ${ua}\r\nReferer: ${referer}\r\nCookie: ${cookiesStr}\r\n`,
          "-i",
          directUrl,
          "-c",
          "copy",
          "-bsf:a",
          "aac_adtstoasc",
          "-y",
          outputFile,
        ];

        const ffmpegProc = spawn(ffmpegBin, ffmpegArgs);

        let ffmpegError = "";
        ffmpegProc.stderr.on("data", (data) => {
          ffmpegError += data.toString();
        });

        await new Promise((resolve, reject) => {
          ffmpegProc.on("close", (code) => {
            if (code === 0) {
              console.log("[HLS-DL] Success!");
              resolve();
            } else {
              console.error(`[HLS-DL] Failed. Error: ${ffmpegError}`);
              reject(new Error(`FFmpeg failed with code ${code}`));
            }
          });
          ffmpegProc.on("error", reject);
        });
      } else {
        await editLocal({
          content: "",
        });
        const dlpEnv = getDlpEnv();
        dlpEnv.PATH = `${ffmpegDir}:/opt/homebrew/bin:/usr/local/bin:${dlpEnv.PATH || ""}`;

        const downloadProcess = spawn(getYtDlp(), dlArgs, {
          env: dlpEnv,
        });

        downloadProcess.stdout.on("data", (data) => {
          stdoutOutput += data.toString();
        });

        downloadProcess.stderr.on("data", (data) => {
          stderrOutput += data.toString();
        });

        const code = await new Promise((resolve) =>
          downloadProcess.on("close", resolve),
        );

        if (code !== 0) {
          const baseNameMatch = path.basename(outputBase);
          const hasFile = fs
            .readdirSync(tempDir)
            .some((f) => f.startsWith(baseNameMatch));

          if (hasFile) {
            console.log(
              `[YT-DLP] Process exited with code ${code}, but file was found. Proceeding...`,
            );
          } else {
            console.error(`[YT-DLP] Failed. Exit Code: ${code}`);
            console.error(`[YT-DLP] Error Output: ${stderrOutput}`);
            let smartError = "Download process failed.";
            if (stderrOutput.includes("Private video"))
              smartError = "This video is private.";
            else if (stderrOutput.includes("Inappropriate content"))
              smartError = "Video restricted due to content.";
            else if (stderrOutput.includes("Sign in to confirm your age"))
              smartError = "Age restricted video (requires new cookies).";
            else if (stderrOutput.includes("Video unavailable"))
              smartError = "Video is no longer available.";
            else if (stderrOutput.includes("403: Forbidden"))
              smartError = "Access forbidden (IP blocking or expired cookies).";
            else if (
              stderrOutput.includes("There is no video in this post") ||
              stderrOutput.includes("no video found") ||
              stderrOutput.includes("No video could be found in this tweet")
            )
              smartError =
                "No video found in this link. For X/Twitter, this often happens for 18+ (sensitive) content or if the post only contains images/text.";

            throw new Error(smartError);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
      let finalFile = outputFile;
      const baseNameMatch = path.basename(outputBase);
      const materializedFile = fs
        .readdirSync(tempDir)
        .find((f) => f.startsWith(baseNameMatch));

      if (materializedFile) {
        finalFile = path.join(tempDir, materializedFile);
      } else if (!fs.existsSync(finalFile)) {
        console.error(
          `[MATERIALIZATION-FAIL] Base: ${baseNameMatch} File: ${finalFile}`,
        );
        console.error(`[STDOUT]: ${stdoutOutput}`);
        console.error(`[STDERR]: ${stderrOutput}`);
        throw new Error(
          "Could not download the file. The website might be blocking us right now. Try again later!",
        );
      }

      let statsSnapshot = fs.statSync(finalFile);
      const limitMB = 24;

      const sizeMB = formatSize(statsSnapshot.size);
      const publicUrl = getAssetUrl(path.basename(finalFile));

      if (statsSnapshot.size > limitMB * 1024 * 1024) {
        if (publicUrl) {
          const DIAMOND =
            guild.emojis.cache.find((e) => e.name === "diamond")?.toString() ||
            "💎";

          const { likes, comments, shares, views, duration, uploader } =
            job?.stats || {
              likes: "0",
              comments: "0",
              shares: "0",
              views: "0",
              duration: "",
              uploader: "",
            };

          const linkEmbed = new EmbedBuilder()
            .setColor(platformColor)
            .setAuthor({
              name: "MaveL Downloads",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Link Ready**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${DIAMOND} **File Too Large for Discord**\n` +
                `${ARROW} **Title:** *${formatTitleForDisplay(title || job?.title)}*\n` +
                `${ARROW} **Size:** *${sizeMB}*\n` +
                `${ARROW} **Source:** *${job?.platform || options.platform || uploader || "---"}*\n` +
                `${ARROW} **Length:** *${formatDuration(duration)}*\n` +
                `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
                `${ARROW} **[DOWNLOAD HD VIDEO](${publicUrl})**\n\n` +
                `*Click the link above to download directly from local host. Link expires in **10 minutes**.*\n\n` +
                (() => {
                  const parts = [];
                  const l = formatNumber(likes || 0);
                  const c = formatNumber(comments || 0);
                  const v = formatNumber(views || 0);
                  if (l !== "0") parts.push(`${l} Likes`);
                  if (c !== "0") parts.push(`${c} Comments`);
                  if (v !== "0") parts.push(`${v} Views`);
                  return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
                })(),
            )
            .setFooter({
              text: `MaveL Downloader (${sizeMB}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          const finalMsg = await interaction.channel.send({
            embeds: [linkEmbed],
          });
          await finalMsg.react(CHECK).catch(() => {});
          await cleanupStatus();
          return;
        }
        throw new Error(`File is too large (over ${limitMB}MB).`);
      }

      const { likes, comments, shares, views, duration, uploader } =
        job?.stats || {
          likes: "0",
          comments: "0",
          shares: "0",
          views: "0",
          duration: "",
          uploader: "",
        };

      const isAudio =
        format.toLowerCase().includes("mp3") ||
        format.toLowerCase().includes("audio");

      if (isAudio && fs.existsSync(finalFile)) {
        const tags = {
          title: (title || job?.title || "MaveL Audio")
            .split(" (")[0]
            .replace(/_/g, " ")
            .trim(),
          artist: (uploader && uploader !== job?.platform
            ? uploader
            : job?.platform || "MaveL"
          ).split(" (")[0],
          album: "MaveL Downloads",
        };

        if (job?.thumbnail) {
          try {
            const thumbRes = await http.get(job.thumbnail, {
              responseType: "arraybuffer",
              timeout: 5000,
            });
            tags.image = {
              mime: "image/jpeg",
              type: { id: 3, name: "front cover" },
              description: "MaveL Info",
              imageBuffer: Buffer.from(thumbRes.data),
            };
          } catch (e) {}
        }
        NodeID3.write(tags, finalFile);
      }

      const cleanBase =
        (title || job?.title || `media_${jobId || Date.now()}`)
          .replace(/[^\p{L}\p{N}\s-]/gu, "")
          .trim()
          .replace(/\s+/g, " ")
          .substring(0, 100) || `media_${jobId || Date.now()}`;

      const finalExt = format === "photo" ? "jpg" : isAudio ? "mp3" : "mp4";
      const attachment = new AttachmentBuilder(finalFile, {
        name: `${cleanBase}.${finalExt}`,
      });

      const cleanDisplayTitle = (title || job?.title || "Media Content")
        .replace(/#\S+/g, "")
        .replace(
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{1F170}-\u{1F251}]/gu,
          "",
        )
        .replace(/\s+/g, " ")
        .trim();

      const safeTitle =
        cleanDisplayTitle.length > 45
          ? cleanDisplayTitle.substring(0, 45) + "..."
          : cleanDisplayTitle || "Media Content";

      const doneEmbed = new EmbedBuilder()
        .setColor(platformColor)
        .setAuthor({
          name: "MaveL Downloads",
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTitle(`${NOTIF} **Media Ready!**`)
        .setThumbnail(job?.thumbnail || "")
        .setImage(botBanner)
        .setDescription(
          (userMention ? `${userMention}\n\n` : "") +
            `${LEA} **Your media is ready**\n` +
            `${ARROW} **Title:** *${safeTitle}*\n` +
            `${ARROW} **Type:** *${job?.isMix ? "Mixed Content" : job?.isVideo || job?.hasVideo ? "Video/Reel" : job?.isGallery ? "Gallery" : "Photo"}*\n` +
            `${ARROW} **Platform:** *${format === "mp3" ? "Audio (MPEG-3)" : format === "photo" ? "Photo (JPG)" : job?.isGallery ? "Gallery (Batch)" : "Video (MP4)"}*\n` +
            `${ARROW} **Source:** *${job?.platform || options.platform || uploader || "---"}*\n` +
            `${ARROW} **Length:** *${formatDuration(duration)}*\n` +
            `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
            (() => {
              const parts = [];
              const l = formatNumber(likes || 0);
              const c = formatNumber(comments || 0);
              const v = formatNumber(views || 0);
              if (l !== "0") parts.push(`${l} Likes`);
              if (c !== "0") parts.push(`${c} Comments`);
              if (v !== "0") parts.push(`${v} Views`);
              return parts.length > 0 ? `*${parts.join(" • ")}*` : "";
            })(),
        )
        .setFooter({
          text: `MaveL Downloader (${sizeMB}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
          iconURL: interaction.client.user.displayAvatarURL(),
        });

      let finalMsg;
      if (!isAudio && !job?.isGallery) {
        await interaction.channel.send({ files: [attachment] });
        finalMsg = await interaction.channel.send({ embeds: [doneEmbed] });
      } else {
        finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: [attachment],
        });
      }

      const msg = interaction.message || interaction;
      await finalMsg.react(CHECK).catch(() => {});

      const userTag =
        (interaction.user || interaction.author || {}).tag || "Unknown User";
      await advanceLog(interaction.client, {
        title: "Download Success",
        color: parseInt(platformColor.replace("#", ""), 16),
        message: `Delivered.`,
        user: userTag,
        platform: job?.platform || options.platform || "Platform",
        url: url,
        size: sizeMB,
      });

      if (interaction.client.clearTempStatus)
        interaction.client.clearTempStatus();
      await cleanupStatus();
      if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    } catch (e) {
      console.error("[Downloader] Unexpected error occurred:", e);
      if (e.message.includes("413") || e.message.includes("large")) {
        console.error(
          "[Downloader] The file is too large for Discord's upload limit.",
        );
      }
      await editLocal({ content: `*Download failed: ${e.message}*` }).catch(
        () => {},
      );
      const userTag =
        (interaction.user || interaction.author || {}).tag || "Unknown User";
      await advanceLog(interaction.client, {
        title: "Download Failed",
        color: parseInt(colors.ERROR.replace("#", ""), 16),
        message: e.message,
        user: userTag,
        platform: job?.platform || options.platform || "Platform",
        url: url,
      });
      if (interaction.client.clearTempStatus)
        interaction.client.clearTempStatus();
    }
  });
}

async function handleDownloadCallback(interaction) {
  const data = interaction.customId;
  if (!data.startsWith("dl_")) return;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const parts = data.split("_");
  const format = parts[1];
  const jobId = parts[2];

  await startDownload(interaction, jobId, format);
}

module.exports = {
  handleDownloadCallback,
  startDownload,
};
