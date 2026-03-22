const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const ffmpegStatic = require("ffmpeg-static");
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

async function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const compressionProcess = spawn(ffmpegStatic, [
      "-i",
      inputPath,
      "-vcodec",
      "libx264",
      "-crf",
      "32",
      "-preset",
      "veryfast",
      "-acodec",
      "aac",
      "-b:a",
      "128k",
      "-y",
      outputPath,
    ]);

    compressionProcess.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Compression failed with code ${code}`));
    });
  });
}

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

  await editLocal({ content: statusContent, embeds: [], components: [] });

  downloadQueue.add(async () => {
    let currentTry = 0;
    const maxTries = (config.retryCount || 1) + 1;

    while (currentTry < maxTries) {
      try {
        currentTry++;
        if (currentTry > 1)
          await editLocal({
            content: `*Retry attempt ${currentTry - 1}/${maxTries - 1}...*`,
          });
        else await editLocal({ content: "*Downloading...*" });

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
        const updateProgress = createProgressUpdater(
          { editReply: editLocal },
          title,
        );

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

          await editLocal({ content: "*Sending gallery...*" });
          const attachments = photoPaths.map((p) => new AttachmentBuilder(p));
          if (fs.existsSync(audioPath))
            attachments.push(new AttachmentBuilder(audioPath));

          const dateStr = new Date().toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
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
          const metaLine = `*${uploader ? `${uploader}  •  ` : ""}${duration ? `${duration}  •  ` : ""}${formatNumber(views)} Views*`;
          const statsLine = `*${formatNumber(likes)} Likes  •  ${formatNumber(comments)} Comments  •  ${formatNumber(shares)} Shares*`;

          const finalMsg = await interaction.channel.send({
            content: job.userId
              ? `*Done, <@${job.userId}> (Gallery).*\n*Link: [Source](<${url}>)*\n${metaLine}\n${statsLine}\n*Date: ${dateStr}*`
              : `*Done (Gallery).*\n*Link: [Source](<${url}>)*\n${metaLine}\n${statsLine}\n*Date: ${dateStr}*`,
            files: attachments,
          });
          await finalMsg.react(config.finishReaction || "✅").catch(() => {});

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
                `best[height<=${resolution}]/best`,
                "--no-playlist",
                "--newline",
                ...getJsRuntimeArgs(),
                ...getCookiesArgs(),
                ...getVpsArgs(),
                "--ffmpeg-location",
                ffmpegStatic,
                "-o",
                outputFile,
                url,
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
                "--ffmpeg-location",
                ffmpegStatic,
                "-o",
                outputFile,
                url,
              ];

        const downloadProcess = spawn(getYtDlp(), dlArgs, { env: getDlpEnv() });
        let stderrOutput = "";

        downloadProcess.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const line of lines) {
            const match = line.match(
              /\[download\]\s+(\d+\.\d+)%\s+of\s+\S+\s+at\s+(\S+)\s+ETA\s+(\S+)/,
            );
            if (match) {
              const percent = parseFloat(match[1]);
              const speed = match[2];
              const eta = match[3];
              updateProgress(percent, speed, eta);
            } else {
              const simpleMatch = line.match(/\[download\]\s+(\d+\.\d+)%/);
              if (simpleMatch) updateProgress(parseFloat(simpleMatch[1]));
            }
          }
        });

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

        await updateProgress(100);

        let finalFile = outputFile;
        let statsSnapshot = fs.statSync(finalFile);
        const limitMB = 10;

        if (format === "mp4" && statsSnapshot.size > limitMB * 1024 * 1024) {
          await editLocal({ content: "*Compressing...*" });
          const compressedPath = `${outputBase}_compressed.mp4`;
          await compressVideo(outputFile, compressedPath);
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          finalFile = compressedPath;
          statsSnapshot = fs.statSync(finalFile);
        }

        const sizeMB = (statsSnapshot.size / (1024 * 1024)).toFixed(2);
        if (statsSnapshot.size > limitMB * 1024 * 1024) {
          throw new Error(`Exceeds 10MB (${sizeMB} MB).`);
        }

        await editLocal({ content: "*Sending...*" });
        const cleanFileName = `${sanitizedTitle}.${format === "mp3" ? "mp3" : "mp4"}`;
        const attachment = new AttachmentBuilder(finalFile, {
          name: cleanFileName,
        });
        const dateStr = new Date().toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
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
        const metaLine = `*${uploader ? `${uploader}  •  ` : ""}${duration ? `${duration}  •  ` : ""}${formatNumber(views)} Views*`;
        const statsLine = `*${formatNumber(likes)} Likes  •  ${formatNumber(comments)} Comments  •  ${formatNumber(shares)} Shares*`;

        const finalMsg = await interaction.channel.send({
          content: job.userId
            ? `*Done, <@${job.userId}>.*\n*Link: [Source](<${url}>)*\n${metaLine}\n${statsLine}\n*Date: ${dateStr}*`
            : `*Done.*\n*Link: [Source](<${url}>)*\n${metaLine}\n${statsLine}\n*Date: ${dateStr}*`,
          files: [attachment],
        });

        await finalMsg.react(config.finishReaction || "✅").catch(() => {});

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
