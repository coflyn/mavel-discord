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
  downloadQueue,
  sendAdminLog,
} = require("./core-helpers");
const config = require("../../config");
const { getAssetUrl } = require("../../utils/tunnel-server");
const axios = require("axios");

async function startDownload(
  interaction,
  jobId,
  format,
  resolution = "720",
  statusMsg = null,
) {
  const db = loadDB();
  const job = db.jobs[jobId];

  if (!job) {
    const errorMsg = "*Error: Request expired.*";
    if (interaction.editReply) {
      return interaction.editReply({ content: errorMsg });
    }
    const msg = statusMsg || interaction;
    if (msg.edit) return await msg.edit({ content: errorMsg });
    return interaction.reply
      ? interaction.reply({ content: errorMsg, ephemeral: true })
      : null;
  }

  const url = job.url;
  const title = job.title;

  const statusContent = `*Queued (${format.toUpperCase()}${format === "mp4" ? ` ${resolution}p` : ""})...*`;

  const editLocal = async (data) => {
    try {
      if (interaction.isButton && interaction.isButton() && !statusMsg) {
        return await interaction.update(data);
      }
      if (interaction.editReply) {
        return await interaction.editReply(data);
      }
      const msg = statusMsg || interaction;
      if (msg.edit) return await msg.edit(data);
    } catch (e) {
      console.error("[DOWNLOAD-EDIT] Error:", e.message);
    }
  };

  const guild = interaction.guild || interaction.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const ARROW = guildEmojis?.find((e) => e.name === "arrow")?.toString() || ">";
  const AMOGUS =
    guildEmojis?.find((e) => e.name === "amogus")?.toString() || "🛰️";
  const FIRE =
    guildEmojis?.find((e) => e.name === "purple_fire")?.toString() || "🔥";

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

        if (format === "gallery") {
          await editLocal({ content: "*Fetching photos...*" });
          const galleryArgs = [
            "--dump-json",
            "--no-playlist",
            ...getJsRuntimeArgs(),
            ...getCookiesArgs(),
            ...getVpsArgs(),
            url,
          ];
          const metaProc = spawn(getYtDlp(), galleryArgs, { env: getDlpEnv() });
          let metaOut = "";
          metaProc.stdout.on("data", (d) => (metaOut += d));
          await new Promise((r) => metaProc.on("close", r));

          const json = JSON.parse(metaOut);
          const entries = json.entries || [];
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
          const ARROW =
            guild.emojis.cache.find((e) => e.name === "arrow")?.toString() ||
            ">";
          const NOTIF =
            guild.emojis.cache.find((e) => e.name === "notif")?.toString() ||
            "🔔";
          const LEA =
            guild.emojis.cache.find((e) => e.name === "lea")?.toString() ||
            "✅";
          const botUser = await interaction.client.user.fetch();
          const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

          const attachments = photoPaths.map((p) => new AttachmentBuilder(p));
          if (fs.existsSync(audioPath))
            attachments.push(new AttachmentBuilder(audioPath));

          const { likes, comments, shares, views, duration, uploader } =
            job.stats || {
              likes: "0",
              comments: "0",
              shares: "0",
              views: "0",
              duration: "",
              uploader: "",
            };

          const userMention = job.userId ? `<@${job.userId}>` : "";
          const checkEmoji =
            guild.emojis.cache.find((e) => e.name === "check")?.toString() ||
            "✅";

          const doneEmbed = new EmbedBuilder()
            .setColor("#5d3fd3")
            .setAuthor({
              name: "MaveL Operation Hub",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(`${NOTIF} **Media Transfer Success**`)
            .setImage(botBanner)
            .setDescription(
              (userMention ? `${userMention}\n\n` : "") +
                `### ${LEA} **Content Delivered**\n` +
                `${ARROW} **Resource:** *${title}*\n` +
                `${ARROW} **Channel:** *${uploader || "System"}*\n` +
                `${ARROW} **Length:** *${duration || "---"}*\n` +
                `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
                `**${formatNumber(likes)}** *Likes*  •  **${formatNumber(comments)}** *Comments*  •  **${formatNumber(views)}** *Views*`,
            )
            .setFooter({
              text: "MaveL Downloader",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTimestamp();

          const finalMsg = await interaction.channel.send({
            embeds: [doneEmbed],
            files: attachments,
          });

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
        const dlArgs =
          format === "mp4"
            ? [
                "-f",
                job.directUrl ? "best" : `best[height<=${resolution}]/best`,
                "--no-playlist",
                "--newline",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
                "-o",
                outputFile,
                job.directUrl || url,
              ]
            : [
                "-f",
                "ba/best",
                "-x",
                "--audio-format",
                "mp3",
                "--no-playlist",
                "--newline",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
                "-o",
                outputFile,
                job.directUrl || url,
              ];

        if (job.directUrl && format === "mp4") {
          try {
            const response = await axios({
              method: "get",
              url: job.directUrl,
              responseType: "stream",
              headers: {
                "User-Agent":
                  process.env.YT_USER_AGENT ||
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                Referer: "https://x.com/",
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

            throw new Error(smartError);
          }
        }

        let finalFile = outputFile;
        let statsSnapshot = fs.statSync(finalFile);
        const limitMB = 24;

        const sizeMB = (statsSnapshot.size / (1024 * 1024)).toFixed(2);
        const publicUrl = getAssetUrl(path.basename(finalFile));

        if (statsSnapshot.size > limitMB * 1024 * 1024) {
          if (publicUrl) {
            const guild = interaction.guild;
            const ARROW =
              guild.emojis.cache.find((e) => e.name === "arrow")?.toString() ||
              ">";
            const NOTIF =
              guild.emojis.cache.find((e) => e.name === "notif")?.toString() ||
              "🔔";
            const botUser = await interaction.client.user.fetch();
            const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

            const DIAMOND =
              guild.emojis.cache
                .find((e) => e.name === "diamond")
                ?.toString() || "💎";

            const linkEmbed = new EmbedBuilder()
              .setColor("#00008b")
              .setTitle(`${NOTIF} **Media Link Ready**`)
              .setImage(botBanner)
              .setDescription(
                `### ${DIAMOND} **File Too Large for Discord**\n` +
                  `${ARROW} **Topic:** *${title}*\n` +
                  `${ARROW} **Size:** *${sizeMB} MB*\n` +
                  `${ARROW} **Source:** [Original Link](<${url}>)\n\n` +
                  `${ARROW} **[DOWNLOAD HD VIDEO](${publicUrl})**\n\n` +
                  `*Click the link above to download directly from local host. Link expires in **10 minutes**.*`,
              );

            await interaction.channel.send({
              embeds: [linkEmbed],
            });

            try {
              if (interaction.deleteReply) await interaction.deleteReply();
              if (statusMsg && statusMsg.delete) await statusMsg.delete();
            } catch (e) {}

            return;
          }
          throw new Error(`Exceeds ${limitMB}MB (${sizeMB} MB).`);
        }

        const guild = interaction.guild;
        const ARROW =
          guild.emojis.cache.find((e) => e.name === "arrow")?.toString() || ">";
        const NOTIF =
          guild.emojis.cache.find((e) => e.name === "notif")?.toString() ||
          "🔔";
        const LEA =
          guild.emojis.cache.find((e) => e.name === "lea")?.toString() || "✅";
        const botUser = await interaction.client.user.fetch();
        const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

        const attachment = new AttachmentBuilder(finalFile, {
          name: sanitizedTitle + (format === "mp3" ? ".mp3" : ".mp4"),
        });

        const { likes, comments, shares, views, duration, uploader } =
          job.stats || {
            likes: "0",
            comments: "0",
            shares: "0",
            views: "0",
            duration: "",
            uploader: "",
          };

        const userMention = job.userId ? `<@${job.userId}>` : "";
        const checkEmoji =
          guild.emojis.cache.find((e) => e.name === "check")?.toString() ||
          "✅";

        const doneEmbed = new EmbedBuilder()
          .setColor("#5d3fd3")
          .setAuthor({
            name: "MaveL Operation Hub",
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTitle(`${NOTIF} **Media Transfer Success**`)
          .setImage(botBanner)
          .setDescription(
            (userMention ? `${userMention}\n\n` : "") +
              `### ${LEA} **Content Delivered**\n` +
              `${ARROW} **Resource:** *${title}*\n` +
              `${ARROW} **Platform:** *${uploader || job.platform || "System"}*\n` +
              `${ARROW} **Length:** *${duration || "---"}*\n` +
              `${ARROW} **Link:** [Source Hub](<${url}>)\n\n` +
              `**${formatNumber(likes)}** *Likes*  •  **${formatNumber(comments)}** *Comments*  •  **${formatNumber(views)}** *Views*`,
          )
          .setFooter({
            text: `MaveL Downloader (${sizeMB} MB)`,
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTimestamp();

        const finalMsg = await interaction.channel.send({
          embeds: [doneEmbed],
          files: [attachment],
        });

        const msg = interaction.message || interaction;
        if (msg.reactions) await msg.reactions.removeAll().catch(() => {});
        await finalMsg.react(checkEmoji).catch(() => {});

        const userTag =
          (interaction.user || interaction.author || {}).tag || "Unknown User";
        await sendAdminLog(interaction.client, {
          title: "Download Success",
          color: 0x000000,
          message: `Delivered.`,
          user: userTag,
          platform: job.platform,
          url: url,
          size: sizeMB,
        });

        await editLocal({ content: "Done." }).catch(() => {});
        if (interaction.deleteReply)
          await interaction.deleteReply().catch(() => {});
        else if (statusMsg && statusMsg.delete)
          await statusMsg.delete().catch(() => {});
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
            platform: job.platform,
            url: url,
          });
          break;
        }
      }
    }
  });
}

async function handleDownloadCallback(interaction) {
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
