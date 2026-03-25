const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const {
  loadDB,
  saveDB,
  createProgressUpdater,
  safeUpdateStatus,
  formatNumber,
  formatSize,
  downloadQueue,
  sendAdminLog,
} = require("./core-helpers");
const config = require("../../config");
const { getAssetUrl } = require("../../utils/tunnel-server");
const axios = require("axios");

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
      const errorMsg = "*Error: Request expired.*";
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
  const title = job ? job.title : options.title || "External Resource";

  const statusContent = `*Queued (${format.toUpperCase()}${format === "mp4" ? ` ${resolution}p` : ""})...*`;

  const cleanupStatus = async () => {
    try {
      if (statusMsg) {
        const msg = statusMsg.resource?.message || statusMsg.message || statusMsg;
        if (msg && typeof msg.delete === "function") {
          await msg.delete().catch(() => {});
        }
      }
      if (interaction && typeof interaction.deleteReply === "function") {
          await interaction.deleteReply().catch(() => {});
      }
    } catch (e) {
        console.error("[CLEANUP-STATUS] Error:", e.message);
    }
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
      
      const msg = statusMsg?.resource?.message || statusMsg?.message || statusMsg || interaction;
      if (msg && typeof msg.edit === "function") {
        return await msg.edit(payload).catch(() => {});
      }
    } catch (e) {
       console.error("[EDIT-LOCAL] Error:", e.message);
    }
  };

  const guild = interaction.guild || interaction.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const ARROW = guildEmojis?.find((e) => e.name === "arrow")?.toString() || "»";
  const NOTIF =
    guildEmojis?.find((e) => e.name === "notif")?.toString() || "🔔";
  const LEA = guildEmojis?.find((e) => e.name === "lea")?.toString() || "✅";
  const AMOGUS =
    guildEmojis?.find((e) => e.name === "amogus")?.toString() || "🛰️";
  const FIRE =
    guildEmojis?.find((e) => e.name === "purple_fire")?.toString() || "🔥";
  const TIME = guildEmojis?.find((e) => e.name === "time")?.toString() || "⏳";
  const CHEST =
    guildEmojis?.find((e) => e.name === "chest")?.toString() || "📦";
  const CHECK =
    guildEmojis?.find((e) =>
      ["check", "verified", "blue_check"].includes(e.name.toLowerCase()),
    ) || "✅";

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#1e4d2b")
      .setDescription(
        `### ${FIRE} **${status}**\n${ARROW} **Resource:** *${title || "Scanning..."}*\n${ARROW} **Details:** *${details}*`,
      );
  };

  await editLocal({
    content: "",
    embeds: [
      getStatusEmbed(
        "Queued",
        `Waiting for ${format.toUpperCase()} ${resolution}p...`,
      ),
    ],
    components: [],
  });

  downloadQueue.add(async () => {
    let currentTry = 0;
    const maxTries = (config.retryCount || 1) + 1;

    while (currentTry < maxTries) {
      try {
        currentTry++;
        if (currentTry > 1) {
          await editLocal({
            embeds: [
              getStatusEmbed(
                "Retrying",
                `Attempt ${currentTry - 1}/${maxTries - 1}...`,
              ),
            ],
          });
        } else {
          await editLocal({
            embeds: [getStatusEmbed("Downloading", "Initializing stream...")],
          });
        }

        const tempDir = path.join(__dirname, "../../temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const sanitizedTitle =
          title
            .replace(/[^\w\s-]/g, "")
            .trim()
            .substring(0, 50) || "file";
        const outputBase = path.join(
          tempDir,
          `${sanitizedTitle}_${Date.now()}`,
        );
        const updateProgress = createProgressUpdater(interaction, title);

        if (format === "twgallery") {
          const { bundleImagesToPdf } = require("../../utils/filetools");
          const urls = job?.twUrls || job?.imageUrls || [];
          if (urls.length === 0) throw new Error("No assets captured.");

          const platformName =
            job?.platform || options.platform || "X / Twitter";
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
                  throw new Error(
                    `Local resource not found: ${cleanLocalPath}`,
                  );
                }
              } else {
                const photoRes = await axios.get(photoUrl, {
                  responseType: "arraybuffer",
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                  },
                });
                fs.writeFileSync(photoPath, photoRes.data);
              }
              photoPaths.push(photoPath);
            } catch (e) {
              console.error(`[SYNC-ERROR] Index ${i}:`, e.message);
              throw e;
            }
          }

          const isDocumentPlatform = ["Scribd", "SlideShare"].includes(
            platformName,
          );
          const shouldBundle = photoPaths.length > 5 || isDocumentPlatform;

          let pdfPath = null;
          let attachments = [];

          if (shouldBundle) {
            await editLocal({
              content: `${CHEST} **Compiling multi-stream into PDF document...**`,
            });
            pdfPath = await bundleImagesToPdf(photoPaths);
            attachments.push(
              new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
            );
          } else {
            attachments = photoPaths.map((p, idx) => {
              const ext = p.split(".").pop();
              return new AttachmentBuilder(p, {
                name: `${sanitizedTitle}_${idx + 1}.${ext}`,
              });
            });
          }

          const userMention = job?.userId ? `<@${job.userId}>` : "";
          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
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
              `${LEA} **Content Delivered**\n` +
              `${ARROW} **Resource:** *${title}*\n` +
              `${ARROW} **Platform:** *${shouldBundle ? (isDocumentPlatform ? "Archival PDF" : "Gallery Bundle") : "Direct Assets"}*\n` +
              `${ARROW} **Source:** *${platformName}*\n` +
              `${ARROW} **Files:** *${urls.length} Images/Assets*\n` +
              `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: attachments,
          });
          await finalMsg.react(CHECK).catch(() => {});

          await cleanupStatus();

          photoPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
          urls.forEach((p) => {
            const isLocalHd =
              typeof p === "string" &&
              (p.includes("_hd_") ||
                p.includes("scribd_") ||
                p.includes("slideshare_") ||
                p.includes("pinterest_"));
            if (isLocalHd && fs.existsSync(p)) {
              fs.unlinkSync(p);
            }
          });
          if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        }

        if (format === "tkgallery") {
          const urls = job?.images || [];
          if (urls.length === 0) throw new Error("No photos found.");

          await editLocal({
            content: `${TIME} **Extracting TikTok Gallery [0/${urls.length}]...**`,
          });
          const photoPaths = [];
          for (let i = 0; i < urls.length; i++) {
            const photoUrl = urls[i];
            const photoPath = path.join(tempDir, `tk_${jobId}_${i}.jpg`);
            const photoRes = await axios.get(photoUrl, {
              responseType: "arraybuffer",
              headers: { Referer: "https://www.tikwm.com/" },
            });
            fs.writeFileSync(photoPath, photoRes.data);
            photoPaths.push(photoPath);

            if ((i + 1) % 5 === 0 || i + 1 === urls.length) {
              await editLocal({
                content: `${TIME} **Extracting TikTok Gallery [${i + 1}/${urls.length}]...**`,
              });
            }
          }

          await editLocal({
            content: `${CHEST} **Bundling pages into PDF document...**`,
          });
          const pdfPath = await bundleImagesToPdf(photoPaths);

          const guild = interaction.guild;

          const userMention = job?.userId ? `<@${job.userId}>` : "";
          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Platform:** *TikTok (Photo Gallery)*\n` +
                `${ARROW} **Source:** *${job?.platform || options.platform || "TikTok"}*\n` +
                `${ARROW} **Pages:** *${urls.length} Photos*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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
              text: `MaveL Downloader (${formatSize(fs.statSync(pdfPath).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: [
              new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
            ],
          });
          await finalMsg.react(CHECK).catch(() => {});

          await cleanupStatus();

          photoPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        }

        if (
          format === "tkmp4" ||
          format === "tkmp3" ||
          job?.extractor === "fx-scrape" ||
          job?.extractor === "threads-scrape" ||
          job?.extractor === "facebook-scrape"
        ) {
          const directUrl = job?.directUrl || options.url;
          if (!directUrl) throw new Error("Source stream lost.");

          let ext = format === "tkmp3" ? "mp3" : job?.hasVideo ? "mp4" : "jpg";
          if (directUrl.includes(".png")) ext = "png";

          const outputFile = path.join(
            tempDir,
            `meta_${jobId || "direct"}.${ext}`,
          );

          await editLocal({
            content: `${TIME} **Fetching Meta Media Resource...**`,
          });

          try {
            const res = await axios.get(directUrl, {
              responseType: "arraybuffer",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
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
          } catch (axiosErr) {}

          const guild = interaction.guild;

          if (
            fs.existsSync(outputFile) &&
            fs.statSync(outputFile).size > 10000
          ) {
            const attachment = new AttachmentBuilder(outputFile, {
              name: `${sanitizedTitle}.${ext}`,
            });

            const userMention = job?.userId ? `<@${job.userId}>` : "";
            const doneEmbed = new EmbedBuilder()
              .setColor("#1e4d2b")
              .setAuthor({
                name: "MaveL Operation Hub",
                iconURL: interaction.client.user.displayAvatarURL(),
              })
              .setTitle(`${NOTIF} **Media Transfer Success**`)
              .setThumbnail(job?.thumbnail || "")
              .setImage(botBanner)
              .setDescription(
                (userMention ? `${userMention}\n\n` : "") +
                  `${LEA} **Content Delivered**\n` +
                  `${ARROW} **Resource:** *${title}*\n` +
                  `${ARROW} **Platform:** *${job?.hasVideo ? "Video Stream" : "Static Image"}*\n` +
                  `${ARROW} **Source:** *${job?.platform || options.platform || "X / Twitter"}*\n` +
                  `${ARROW} **Length:** *${job?.stats?.duration || "---"}*\n` +
                  `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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
            job?.title || `cloud_${jobId || "direct"}.bin`,
          );

          await editLocal({
            content: `${TIME} **Fetching ${platform} document...**`,
          });

          if (platform === "MEGA") {
            const { File } = require("megajs");
            const file = File.fromURL(url);
            await file.loadAttributes();

            await new Promise((resolve, reject) => {
              const stream = file.download();
              const writer = fs.createWriteStream(outputFile);
              stream.pipe(writer);
              stream.on("error", reject);
              writer.on("finish", resolve);
              writer.on("error", reject);
            });
          } else {
            const res = await axios.get(directUrl, {
              responseType: "arraybuffer",
              headers: { "User-Agent": "Mozilla/5.0" },
              maxRedirects: 5,
            });
            fs.writeFileSync(outputFile, res.data);
          }

          const attachment = new AttachmentBuilder(outputFile);
          const guild = interaction.guild;

          const userMention = job?.userId ? `<@${job.userId}>` : "";
          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Vault Object Retrieved**\n` +
                `${ARROW} **Resource:** *${job?.title || options.title || "External Resource"}*\n` +
                `${ARROW} **Platform:** *Cloud Document*\n` +
                `${ARROW} **Source:** *${platform}*\n` +
                `${ARROW} **Length:** *---*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)`,
            )
            .setFooter({
              text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          if (
            fs.existsSync(outputFile) &&
            fs.statSync(outputFile).size > 10000
          ) {
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
            content: `${TIME} **Matching audio signal via search matrix...**`,
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
            ...getCookiesArgs(),
            ...getVpsArgs(),
          ];

          const spProc = spawn(getYtDlp(), spArgs, { env: getDlpEnv() });
          await new Promise((r) => spProc.on("close", r));

          if (!fs.existsSync(outputFile))
            throw new Error("Audio signal failed to materialize.");

          const attachment = new AttachmentBuilder(outputFile, {
            name: `${sanitizedTitle}.mp3`,
          });

          const guild = interaction.guild;

          const userMention = job?.userId ? `<@${job.userId}>` : "";
          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Platform:** *High-Fidelity Audio*\n` +
                `${ARROW} **Source:** *Spotify (Resolved)*\n` +
                `${ARROW} **Length:** *Track*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)`,
            )
            .setFooter({
              text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          if (
            fs.existsSync(outputFile) &&
            fs.statSync(outputFile).size > 10000
          ) {
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

        const { bundleImagesToPdf } = require("../../utils/filetools");

        if (format === "pixiv_gallery") {
          const urls = job?.pixivUrls || options.urls || [];
          if (urls.length === 0) throw new Error("Artwork data lost.");

          await editLocal({
            content: `${TIME} **Extracting Pixiv Gallery [0/${urls.length}]...**`,
          });
          const photoPaths = [];
          for (let i = 0; i < urls.length; i++) {
            const photoUrl = urls[i];
            const photoPath = path.join(tempDir, `pixiv_${jobId}_${i}.jpg`);
            const photoRes = await axios.get(photoUrl, {
              responseType: "arraybuffer",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
              },
            });
            fs.writeFileSync(photoPath, photoRes.data);
            photoPaths.push(photoPath);

            if ((i + 1) % 5 === 0 || i + 1 === urls.length) {
              await editLocal({
                content: `${TIME} **Extracting Pixiv Gallery [${i + 1}/${urls.length}]...**`,
              });
            }
          }

          await editLocal({
            content: `${CHEST} **Bundling pages into PDF document...**`,
          });
          const pdfPath = await bundleImagesToPdf(photoPaths);

          const guild = interaction.guild;

          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Platform:** *Pixiv Gallery Document*\n` +
                `${ARROW} **Source:** *Pixiv (Archive)*\n` +
                `${ARROW} **Pages:** *${urls.length} Compiled*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)`,
            )
            .setFooter({
              text: `MaveL Downloader (${formatSize(fs.statSync(pdfPath).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: [
              new AttachmentBuilder(pdfPath, { name: `${sanitizedTitle}.pdf` }),
            ],
          });
          await finalMsg.react(CHECK).catch(() => {});

          await cleanupStatus();
          photoPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        }

        if (format === "pixiv_ugoira") {
          const directUrl = job?.pixivUrls ? job.pixivUrls[0] : options.url;
          const outputFile = path.join(tempDir, `pixiv_${jobId}.mp4`);

          await editLocal({
            content: `${TIME} **Downloading Pixiv Animation...**`,
          });
          const videoRes = await axios.get(directUrl, {
            responseType: "arraybuffer",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            },
          });
          fs.writeFileSync(outputFile, videoRes.data);

          const attachment = new AttachmentBuilder(outputFile, {
            name: `pixiv_${jobId}.mp4`,
          });

          const guild = interaction.guild;

          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setImage(botBanner)
            .setDescription(
              `${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Platform:** *Pixiv Animation*\n` +
                `${ARROW} **Source:** *Pixiv (Ugoira)*\n` +
                `${ARROW} **Length:** *Animated*\n` +
                `${ARROW} **Link:** [View Pixiv](<${url}>)`,
            )
            .setFooter({
              text: `MaveL Downloader (${formatSize(fs.statSync(outputFile).size)}) • Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            });

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: [attachment],
          });
          await finalMsg.react(CHECK).catch(() => {});
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          return;
        }

        if (format === "gallery") {
          await editLocal({ content: "*Fetching photos...*" });
          const galleryArgs = [
            "--dump-json",
            ...getJsRuntimeArgs(),
            ...getCookiesArgs(),
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
            content: `*Downloading ${entries.length} photos...*`,
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

          await editLocal({ content: "*Downloading background audio...*" });
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
              ...getCookiesArgs(),
              ...getVpsArgs(),
              "-o",
              audioPath,
              url,
            ],
            { env: getDlpEnv() },
          );
          await new Promise((r) => dlAudio.on("close", r));

          const guild = interaction.guild;

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

          const userMention = job?.userId ? `<@${job.userId}>` : "";
          const checkEmoji =
            guild.emojis.cache.find((e) => e.name === "check")?.toString() ||
            "✅";

          const doneEmbed = new EmbedBuilder()
            .setColor("#1e4d2b")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setThumbnail(job?.thumbnail || "")
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Platform:** *Gallery Album*\n` +
                `${ARROW} **Source:** *${uploader || "System"}*\n` +
                `${ARROW} **Length:** *---*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: attachments,
          });
          await finalMsg.react(CHECK).catch(() => {});

          const msg = interaction.message || interaction;
          if (msg.reactions) await msg.reactions.removeAll().catch(() => {});
          await finalMsg.react(checkEmoji).catch(() => {});

          photoPaths.forEach((p) => fs.unlinkSync(p));
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          await editLocal({ content: "Done." }).catch(() => {});
          if (interaction.deleteReply)
            await interaction.deleteReply().catch(() => {});
          else if (statusMsg && statusMsg.delete)
            await statusMsg.delete().catch(() => {});
          return;
        }

        const outputFile =
          format === "mp4" ? `${outputBase}.mp4` : `${outputBase}.mp3`;
        const ua =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
        const referer = url.includes("tiktok.com")
          ? "https://www.tiktok.com/"
          : url.includes("instagram.com")
            ? "https://www.instagram.com/"
            : url.includes("twitter.com") || url.includes("x.com")
              ? "https://x.com/"
              : "https://www.google.com/";

        const cleanTitleMatch = (job?.title || options.title || "").replace(/\[Album\]/g, "").trim();

        const dlArgs =
          format === "mp4"
            ? [
                "-f",
                job?.directUrl
                  ? "best"
                  : `bv*[height<=${resolution}]+ba/b[height<=${resolution}] / best[height<=${resolution}] / best`,
                "--no-playlist",
                cleanTitleMatch && !job?.directUrl ? "--match-title" : null,
                cleanTitleMatch && !job?.directUrl ? `(?i)${cleanTitleMatch.split(" - ").pop()}` : null,
                "--newline",
                "--embed-metadata",
                "--embed-thumbnail",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
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
                url.includes("twitter.com") || url.includes("x.com")
                  ? url
                  : job?.directUrl || url,
              ].filter(Boolean)
            : [
                "-f",
                "ba/best",
                "-x",
                "--audio-format",
                "mp3",
                "--no-playlist",
                cleanTitleMatch && !job?.directUrl ? "--match-title" : null,
                cleanTitleMatch && !job?.directUrl ? `(?i)${cleanTitleMatch.split(" - ").pop()}` : null,
                "--newline",
                "--embed-metadata",
                "--embed-thumbnail",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
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
                url.includes("twitter.com") || url.includes("x.com")
                  ? url
                  : job?.directUrl || url,
              ].filter(Boolean);

        const skipAxiosPlatforms = [
          "tiktok",
          "instagram",
          "facebook",
          "youtube",
          "ytm",
        ];
        const isSkipPlatform = skipAxiosPlatforms.some((p) =>
          job?.platform?.toLowerCase().includes(p),
        );

        const directUrl = job?.directUrl || options.url;
        if (job?.directUrl && format === "mp4" && !isSkipPlatform) {
          await editLocal({
            content: `${TIME} **Extracting high-fidelity stream...**`,
          });
          try {
            const response = await axios({
              method: "get",
              url: directUrl,
              responseType: "stream",
              headers: {
                "User-Agent": ua,
                Referer: referer,
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
        } else {
          await editLocal({
            content: `${TIME} **Engaging advanced media retrieval engine...**`,
          });
          const downloadProcess = spawn(getYtDlp(), dlArgs, {
            env: getDlpEnv(),
          });

          let stderrOutput = "";

          downloadProcess.stdout.on("data", (data) => {});

          downloadProcess.stderr.on("data", (data) => {
            stderrOutput += data.toString();
          });

          const code = await new Promise((resolve) =>
            downloadProcess.on("close", resolve),
          );

          if (code !== 0) {
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

        let finalFile = outputFile;
        if (!fs.existsSync(finalFile)) {
          throw new Error(
            "Target file failed to materialize. The platform may have restricted access from our current network node.",
          );
        }
        let statsSnapshot = fs.statSync(finalFile);
        const limitMB = 24;

        const sizeMB = formatSize(statsSnapshot.size);
        const publicUrl = getAssetUrl(path.basename(finalFile));

        if (statsSnapshot.size > limitMB * 1024 * 1024) {
          if (publicUrl) {
            const guild = interaction.guild;

            const DIAMOND =
              guild.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";

            const { likes, comments, shares, views, duration, uploader } =
              job?.stats || {
                likes: "0",
                comments: "0",
                shares: "0",
                views: "0",
                duration: "",
                uploader: "",
              };

            const formatDuration = (input) => {
              if (!input) return "---";
              if (typeof input === "string" && input.includes(":")) {
                return input.split(".")[0];
              }
              if (isNaN(input)) return input || "---";
              const s = Math.floor(input);
              const m = Math.floor(s / 60);
              const rs = s % 60;
              return `${m}:${rs.toString().padStart(2, "0")}`;
            };

            const userMention = job?.userId ? `<@${job.userId}>` : "";

            const linkEmbed = new EmbedBuilder()
              .setColor("#1e4d2b")
              .setAuthor({
                name: "MaveL Operation Hub",
                iconURL: interaction.client.user.displayAvatarURL(),
              })
              .setTitle(`${NOTIF} **Media Link Ready**`)
              .setThumbnail(job?.thumbnail || "")
              .setImage(botBanner)
              .setDescription(
                (userMention ? `${userMention}\n\n` : "") +
                  `### ${DIAMOND} **File Too Large for Discord**\n` +
                  `${ARROW} **Resource:** *${title}*\n` +
                  `${ARROW} **Size:** *${sizeMB}*\n` +
                  `${ARROW} **Source:** *${job?.platform || options.platform || uploader || "---"}*\n` +
                  `${ARROW} **Length:** *${formatDuration(duration)}*\n` +
                  `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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

            try {
              if (interaction.deleteReply) await interaction.deleteReply();
              if (statusMsg && statusMsg.delete) await statusMsg.delete();
            } catch (e) {}

            return;
          }
          throw new Error(`Exceeds ${limitMB}MB (${sizeMB}).`);
        }

        const guild = interaction.guild;

        const attachment = new AttachmentBuilder(finalFile, {
          name: sanitizedTitle + (format === "mp3" ? ".mp3" : ".mp4"),
        });

        const { likes, comments, shares, views, duration, uploader } =
          job?.stats || {
            likes: "0",
            comments: "0",
            shares: "0",
            views: "0",
            duration: "",
            uploader: "",
          };

        const userMention = job?.userId ? `<@${job.userId}>` : "";

        const formatDuration = (input) => {
          if (!input) return "---";
          if (typeof input === "string" && input.includes(":")) {
            return input.split(".")[0];
          }
          if (isNaN(input)) return input || "---";
          const s = Math.floor(input);
          const m = Math.floor(s / 60);
          const rs = s % 60;
          return `${m}:${rs.toString().padStart(2, "0")}`;
        };

        const doneEmbed = new EmbedBuilder()
          .setColor("#1e4d2b")
          .setAuthor({
            name: "MaveL Operation Hub",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Transfer Success**`)
          .setThumbnail(
            job?.thumbnail || interaction.client.user.displayAvatarURL(),
          )
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `${LEA} **Content Delivered**\n` +
              `${ARROW} **Resource:** *${title}*\n` +
              `${ARROW} **Platform:** *${format === "mp3" ? "Audio (MPEG-3)" : "Video (MP4)"}*\n` +
              `${ARROW} **Source:** *${job?.platform || options.platform || uploader || "---"}*\n` +
              `${ARROW} **Length:** *${formatDuration(duration)}*\n` +
              `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
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
          embeds: [doneEmbed],
          files: [attachment],
        });

        const msg = interaction.message || interaction;
        if (msg.reactions) await msg.reactions.removeAll().catch(() => {});
        await finalMsg.react(CHECK).catch(() => {});

        const userTag =
          (interaction.user || interaction.author || {}).tag || "Unknown User";
        await sendAdminLog(interaction.client, {
          title: "Download Success",
          color: 0x000000,
          message: `Delivered.`,
          user: userTag,
          platform: job?.platform || options.platform || "Platform",
          url: url,
          size: sizeMB,
        });

        await editLocal({ content: "Done." }).catch(() => {});
        await cleanupStatus();
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);

        break;
      } catch (e) {
        if (currentTry >= maxTries) {
          console.error("[DOWNLOADER-RETRY-FAILED] Error:", e.message);
          await editLocal({ content: `*Download failed: ${e.message}*` }).catch(
            () => {},
          );
          const userTag =
            (interaction.user || interaction.author || {}).tag ||
            "Unknown User";
          await sendAdminLog(interaction.client, {
            title: "Download Failed",
            color: 0x000000,
            message: e.message,
            user: userTag,
            platform: job?.platform || options.platform || "Platform",
            url: url,
          });
          break;
        }
      }
    }
  });
}

async function handleDownloadCallback(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const data = interaction.customId;
  const parts = data.split("_");

  if (!data.startsWith("dl_")) return;

  const format = parts[1];
  const jobId = parts[2];

  await startDownload(interaction, jobId, format);
}

module.exports = {
  handleDownloadCallback,
  startDownload,
};
