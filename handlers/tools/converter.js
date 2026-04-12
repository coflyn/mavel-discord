const {
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ActivityType,
} = require("discord.js");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { advanceLog } = require("../../utils/logger");
const { PDFDocument } = require("pdf-lib");
const { chromium } = require("playwright");
const mammoth = require("mammoth");
const { getAssetUrl } = require("../../utils/tunnel-server");
const { bundleImagesToPdf } = require("../../utils/filetools");

module.exports = async function converterHandler(interaction) {
  const guild = interaction.guild;
  const guildEmojis =
    (await interaction.client.getGuildEmojis?.(guild.id)) ||
    (await guild.emojis.fetch().catch(() => null));
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const E_TIME = getEmoji("time", "⏳");
  const E_SYNC = getEmoji("online", "🔄");
  const E_ARROW = getEmoji("arrow", "•");
  const E_FIRE = getEmoji("purple_fire", "🔥");
  const E_ROCKET = getEmoji("rocket", "🚀");
  const E_CHEST = getEmoji("chest", "📦");
  const E_DIAMOND = getEmoji("diamond", "💎");
  const E_PING_GREEN = getEmoji("ping_green", "🟢");
  const E_PING_RED = getEmoji("ping_red", "🔴");
  const E_NOTIF = getEmoji("notif", "🔔");

  const rootTempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(rootTempDir))
    fs.mkdirSync(rootTempDir, { recursive: true });

  if (interaction.isMessageContextMenuCommand()) {
    const targetMsg = interaction.targetMessage;
    const hasAttachments = targetMsg.attachments.size > 0;
    const hasEmbeds = targetMsg.embeds.some(
      (e) =>
        e.image ||
        e.video ||
        e.thumbnail ||
        e.url?.match(/\.(mp4|mkv|gif|png|jpg|jpeg|webp)$/i),
    );

    if (!hasAttachments && !hasEmbeds) {
      return await interaction.reply({
        content: `### ${E_PING_RED} **No Media Detected**\nThis message doesn't seem to contain any convertible media.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`conv_pick_${targetMsg.id}`)
      .setPlaceholder("Select destination format...")
      .addOptions(
        {
          label: "Video: MP4 (HQ Compressed)",
          description: "High quality MP4 conversion",
          value: "mp4",
        },
        {
          label: "Video: MP4 (8MB - No Nitro)",
          description: "Compressed for non-Nitro users",
          value: "mp4_small",
        },
        {
          label: "Video: GIF (High Quality)",
          description: "Smooth animated GIF",
          value: "gif",
        },
        {
          label: "Video: GIF (Small/Fast)",
          description: "Fast-loading small GIF",
          value: "gif_small",
        },
        {
          label: "Audio: MP3 (320kbps)",
          description: "Extract high quality audio",
          value: "mp3",
        },
        {
          label: "Audio: OGG (Soundboard Ready)",
          description: "Low latency audio format",
          value: "ogg",
        },
        {
          label: "Audio: WAV (Lossless)",
          description: "Pure uncompressed audio",
          value: "wav",
        },
        {
          label: "Image: PNG",
          description: "Convert first frame to lossless PNG",
          value: "png",
        },
        {
          label: "Image: JPG",
          description: "Convert to standard JPG image",
          value: "jpg",
        },
        {
          label: "Image: WebP",
          description: "Efficient modern web image format",
          value: "webp",
        },
        {
          label: "Document: Multiple Images to PDF",
          description: "Bundle gallery into one PDF",
          value: "pdf",
        },
        {
          label: "Document: Word (.docx) to PDF",
          description: "Professional PDF rendering",
          value: "word_to_pdf",
        },
      );

    const row = new ActionRowBuilder().addComponents(select);
    return await interaction.reply({
      content: `### ${E_SYNC} **MaveL Media Converter**\nChoose target format for **${targetMsg.author.username}**'s media:`,
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });
  }

  let targetFormat = null;
  let filesToProcess = [];
  let sourceLabel = "Uploaded File";
  let targetMsgId = null;

  if (interaction.isChatInputCommand()) {
    targetFormat = interaction.options.getString("to");
    const uploadedFile = interaction.options.getAttachment("file");
    if (uploadedFile) {
      filesToProcess.push({
        url: uploadedFile.url,
        name: uploadedFile.name,
        type: uploadedFile.contentType,
      });
    }
  } else if (interaction.isStringSelectMenu()) {
    targetFormat = interaction.values[0];
    targetMsgId = interaction.customId.replace("conv_pick_", "");
    await interaction.update({
      content: `### ${E_TIME} **Initializing Engine...**`,
      components: [],
    });
  }

  const inputId = `${Date.now()}`;
  const outputName = `mave_conv_${inputId}.${targetFormat === "pdf" ? "pdf" : targetFormat}`;
  const outputPath = path.join(rootTempDir, outputName);
  const localPaths = [];

  try {
    if (filesToProcess.length === 0 && targetMsgId) {
      let currentMsg = await interaction.channel.messages
        .fetch(targetMsgId)
        .catch(() => null);
      let depth = 0;
      while (currentMsg && depth < 2) {
        if (currentMsg.attachments.size > 0) {
          currentMsg.attachments.forEach((att) =>
            filesToProcess.push({
              url: att.url,
              name: att.name,
              type: att.contentType,
            }),
          );
        }
        if (filesToProcess.length === 0 && currentMsg.embeds.length > 0) {
          currentMsg.embeds.forEach((embed) => {
            const mediaUrl =
              embed.image?.url ||
              embed.video?.url ||
              embed.thumbnail?.url ||
              (embed.url?.match(/\.(mp4|mkv|gif|png|jpg|jpeg|webp)$/i)
                ? embed.url
                : null);
            if (mediaUrl && mediaUrl.startsWith("http")) {
              filesToProcess.push({
                url: mediaUrl,
                name: `media_${Date.now()}`,
                type: "image/unknown",
              });
            }
          });
        }
        if (filesToProcess.length > 0) {
          sourceLabel =
            depth === 0 ? "Target Message" : "Parent Message (Traced)";
          break;
        }
        if (currentMsg.reference?.messageId) {
          currentMsg = await interaction.channel.messages
            .fetch(currentMsg.reference.messageId)
            .catch(() => null);
          depth++;
        } else break;
      }
    }

    if (filesToProcess.length === 0) {
      throw new Error(
        "Could not locate media file. Try using right-click -> Apps -> Convert Media again.",
      );
    }

    const isVideoInput = filesToProcess.some(
      (f) =>
        f.type?.startsWith("video/") ||
        f.name.match(/\.(mp4|mkv|mov|avi|flv|wmv)$/i),
    );
    const isAudioInput = filesToProcess.some(
      (f) =>
        f.type?.startsWith("audio/") ||
        f.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i),
    );
    const isDocInput = filesToProcess.some((f) =>
      f.name.match(/\.(docx|doc)$/i),
    );

    if (targetFormat === "pdf" && isVideoInput) {
      throw new Error(
        "'Images to PDF' requires photos, but a video was detected.",
      );
    }
    if (targetFormat === "word_to_pdf" && !isDocInput) {
      throw new Error("'Word to PDF' requires a .docx file.");
    }
    if (
      ["mp3", "ogg", "wav"].includes(targetFormat) &&
      !isVideoInput &&
      !isAudioInput
    ) {
      throw new Error(
        "Audio extraction requires a video or audio file source.",
      );
    }
    if (
      ["mp4", "mp4_small", "gif", "gif_small", "png", "jpg", "webp"].includes(
        targetFormat,
      ) &&
      isDocInput
    ) {
      throw new Error("Cannot convert a document into a media format.");
    }

    if (!interaction.deferred && !interaction.replied)
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6c5ce7")
          .setDescription(
            `### ${E_TIME} **Preparing Engine...**\n${E_ARROW} **Source:** *${sourceLabel}*\n${E_ARROW} **Task:** *Downloading media...*`,
          ),
      ],
    });

    if (interaction.client.setTempStatus) {
      interaction.client.setTempStatus(
        "Converting Media...",
        ActivityType.Watching,
        60000,
      );
    }

    for (let i = 0; i < filesToProcess.length; i++) {
      const f = filesToProcess[i];
      const p = path.join(
        rootTempDir,
        `in_${inputId}_${i}_${f.name.replace(/[^\w.-]/g, "_")}`,
      );
      const res = await axios.get(f.url, { responseType: "stream" });
      const writer = fs.createWriteStream(p);
      res.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      localPaths.push(p);
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6c5ce7")
          .setDescription(
            `### ${E_SYNC} **Rendering Engine**\n${E_ARROW} **Process:** *Encoding to ${targetFormat.toUpperCase()}...*`,
          ),
      ],
    });

    if (targetFormat === "pdf" && localPaths.length > 0) {
      const areImages = filesToProcess.every(
        (f) =>
          f.type?.startsWith("image/") ||
          f.name.match(/\.(jpg|jpeg|png|webp)$/i),
      );
      if (areImages && localPaths.length > 1) {
        const pdfFile = await bundleImagesToPdf(localPaths);
        if (fs.existsSync(pdfFile)) fs.renameSync(pdfFile, outputPath);
      } else {
        const pdfDoc = await PDFDocument.create();
        const imgBytes = fs.readFileSync(localPaths[0]);
        let pageImg;
        if (
          filesToProcess[0].type?.includes("png") ||
          filesToProcess[0].name.toLowerCase().endsWith(".png")
        )
          pageImg = await pdfDoc.embedPng(imgBytes);
        else pageImg = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([pageImg.width, pageImg.height]);
        page.drawImage(pageImg, {
          x: 0,
          y: 0,
          width: pageImg.width,
          height: pageImg.height,
        });
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
      }
    } else if (targetFormat === "word_to_pdf") {
      const { value: html } = await mammoth.convertToHtml({
        path: localPaths[0],
      });
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(
        `<style>body{font-family:sans-serif;padding:40px;line-height:1.6}img{max-width:100%}</style>${html}`,
      );
      await page.pdf({
        path: outputPath,
        format: "A4",
        margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
        printBackground: true,
      });
      await browser.close();
    } else {
      let ffmpegArgs = ["-i", localPaths[0]];
      if (targetFormat === "mp4")
        ffmpegArgs.push(
          "-c:v",
          "libx264",
          "-crf",
          "24",
          "-preset",
          "faster",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-y",
        );
      else if (targetFormat === "mp4_small")
        ffmpegArgs.push(
          "-c:v",
          "libx264",
          "-crf",
          "32",
          "-vf",
          "scale=-2:480",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-b:a",
          "64k",
          "-y",
        );
      else if (targetFormat === "gif")
        ffmpegArgs.push(
          "-vf",
          "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
          "-y",
        );
      else if (targetFormat === "gif_small")
        ffmpegArgs.push("-vf", "fps=12,scale=320:-1:flags=box", "-y");
      else if (targetFormat === "mp3")
        ffmpegArgs.push(
          "-vn",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-b:a",
          "320k",
          "-y",
        );
      else if (targetFormat === "ogg")
        ffmpegArgs.push("-vn", "-c:a", "libvorbis", "-q:a", "4", "-y");
      else if (targetFormat === "wav") ffmpegArgs.push("-vn", "-y");
      else if (["png", "jpg", "webp"].includes(targetFormat))
        ffmpegArgs.push("-frames:v", "1", "-q:v", "2", "-y");
      ffmpegArgs.push(outputPath);

      const ffmpegProc = spawn("ffmpeg", ffmpegArgs);
      await new Promise((resolve, reject) => {
        ffmpegProc.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`FFmpeg engine failed.`)),
        );
        ffmpegProc.on("error", reject);
      });
    }

    if (interaction.client.clearTempStatus)
      interaction.client.clearTempStatus();
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const limitMB = targetFormat === "mp4_small" ? 8 : 25;
    const isLarge = stats.size > limitMB * 1024 * 1024;

    const cleanupStatus = () =>
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);

    if (isLarge) {
      const tunnelLink = getAssetUrl(outputName);
      const deliveryEmbed = new EmbedBuilder()
        .setColor("#6c5ce7")
        .setTitle(`${E_FIRE} **Media Ready (Tunnel)**`)
        .setDescription(
          `### ${E_DIAMOND} **Large File Processing**\n${E_ARROW} **Format:** \`${targetFormat.toUpperCase()}\`\n${E_ARROW} **Final Size:** \`${sizeMB} MB\`\n\n${E_ARROW} **[${E_PING_GREEN} DOWNLOAD VIA CLOUDFLARE](${tunnelLink})**\n\n*Note: Link expires in 10 minutes.*`,
        );
      await interaction.editReply({ embeds: [deliveryEmbed] });
      cleanupStatus();
      setTimeout(
        () => fs.existsSync(outputPath) && fs.unlinkSync(outputPath),
        600000,
      );
    } else {
      const resultFile = new AttachmentBuilder(outputPath, {
        name: outputName,
      });
      await interaction.editReply({
        content: `### ${E_ROCKET} **Conversion Success!**\n${E_ARROW} **Target:** \`${targetFormat.toUpperCase()}\`\n${E_ARROW} **Size:** \`${sizeMB} MB\``,
        files: [resultFile],
        embeds: [],
      });
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }

    localPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
  } catch (err) {
    if (interaction.client.clearTempStatus)
      interaction.client.clearTempStatus();
    console.error("[CONVERTER] Error:", err.message);
    await interaction.editReply({
      content: `### ${E_PING_RED} **Engine Error**\n${E_ARROW} *Details: ${err.message}*`,
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    localPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
};
