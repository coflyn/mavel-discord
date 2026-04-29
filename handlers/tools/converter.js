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
const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");

module.exports = async function converterHandler(interaction) {
  if (interaction.isMessageContextMenuCommand()) {
  } else if (interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
  } else if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  }

  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

  const E_TIME = getEmoji("time", "⏳");
  const E_SYNC = getEmoji("online", "🔄");
  const E_ARROW = getEmoji("arrow", "•");
  const E_FIRE = getEmoji("purple_fire", "🔥");
  const E_ROCKET = getEmoji("rocket", "🚀");
  const E_DIAMOND = getEmoji("diamond", "💎");
  const E_PING_GREEN = getEmoji("ping_green", "🟢");
  const E_PING_RED = getEmoji("ping_red", "🔴");

  const rootTempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(rootTempDir))
    fs.mkdirSync(rootTempDir, { recursive: true });

  if (interaction.isMessageContextMenuCommand()) {
    const targetMsg = interaction.targetMessage;
    const hasMedia =
      targetMsg.attachments.size > 0 ||
      targetMsg.embeds.some(
        (e) =>
          e.image ||
          e.video ||
          e.thumbnail ||
          e.url?.match(/\.(mp4|mkv|gif|png|jpg|jpeg|webp)$/i),
      );
    if (!hasMedia) {
      return await interaction.reply({
        content: `### ${E_PING_RED} **No Media Detected**\nCouldn't find any convertible attachments or links.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId(`conv_pick_${targetMsg.id}`)
      .setPlaceholder("Select destination format...")
      .addOptions(
        { label: "Video: MP4 (HQ)", value: "mp4" },
        { label: "Video: MP4 (8MB/Fast)", value: "mp4_small" },
        { label: "Video: GIF (HQ)", value: "gif" },
        { label: "Video: GIF (Small)", value: "gif_small" },
        { label: "Audio: MP3", value: "mp3" },
        { label: "Audio: OGG", value: "ogg" },
        { label: "Audio: WAV", value: "wav" },
        { label: "Image: PNG", value: "png" },
        { label: "Image: JPG", value: "jpg" },
        { label: "Image: WebP", value: "webp" },
        { label: "Document: Multiple Images to PDF", value: "pdf" },
        { label: "Document: Word to PDF", value: "word_to_pdf" },
      );
    return await interaction.reply({
      content: `### ${E_SYNC} **MaveL Media Converter**\nTarget for **${targetMsg.author.username}**'s media:`,
      components: [new ActionRowBuilder().addComponents(select)],
      flags: [MessageFlags.Ephemeral],
    });
  }

  let targetFormat = null,
    filesToProcess = [],
    sourceLabel = "Uploaded File",
    targetMsgId = null;
  if (interaction.isChatInputCommand()) {
    targetFormat = interaction.options.getString("to");
    const uploadedFile = interaction.options.getAttachment("file");
    if (uploadedFile)
      filesToProcess.push({
        url: uploadedFile.url,
        name: uploadedFile.name,
        type: uploadedFile.contentType,
      });
  } else if (interaction.isStringSelectMenu()) {
    targetFormat = interaction.values[0];
    targetMsgId = interaction.customId.replace("conv_pick_", "");
    await interaction.editReply({
      content: `### ${E_TIME} **Initializing Engine...**`,
      components: [],
    });
  }

  const inputId = `${Date.now()}`;
  let ext = targetFormat;
  if (targetFormat.includes("mp4")) ext = "mp4";
  if (targetFormat.includes("gif")) ext = "gif";
  if (targetFormat.includes("pdf")) ext = "pdf";

  const outputName = `mave_conv_${inputId}.${ext}`;
  const outputPath = path.join(rootTempDir, outputName);
  const localPaths = [];

  try {
    if (filesToProcess.length === 0 && targetMsgId) {
      let currentMsg = await interaction.channel.messages
        .fetch(targetMsgId)
        .catch(() => null);
      let depth = 0;
      while (currentMsg && depth < 2) {
        if (currentMsg.attachments.size > 0)
          currentMsg.attachments.forEach((att) =>
            filesToProcess.push({
              url: att.url,
              name: att.name,
              type: att.contentType,
            }),
          );
        if (filesToProcess.length === 0 && currentMsg.embeds.length > 0) {
          currentMsg.embeds.forEach((embed) => {
            const mediaUrl =
              embed.image?.url ||
              embed.video?.url ||
              embed.thumbnail?.url ||
              (embed.url?.match(/\.(mp4|mkv|gif|png|jpg|jpeg|webp)$/i)
                ? embed.url
                : null);
            if (mediaUrl && mediaUrl.startsWith("http"))
              filesToProcess.push({
                url: mediaUrl,
                name: `media_${Date.now()}`,
                type: "image/unknown",
              });
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

    if (filesToProcess.length === 0) throw new Error("Media source not found.");

    const isVideo = filesToProcess.some(
      (f) =>
        f.type?.startsWith("video/") ||
        f.name.match(/\.(mp4|mkv|mov|avi|flv|wmv)$/i),
    );
    const isAudio = filesToProcess.some(
      (f) =>
        f.type?.startsWith("audio/") ||
        f.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i),
    );
    const isDoc = filesToProcess.some((f) => f.name.match(/\.(docx|doc)$/i));

    if (targetFormat === "pdf" && isVideo)
      throw new Error("'Images to PDF' doesn't support video.");
    if (targetFormat === "word_to_pdf" && !isDoc)
      throw new Error("'Word to PDF' requires a .docx file.");
    if (["mp3", "ogg", "wav"].includes(targetFormat) && !isVideo && !isAudio)
      throw new Error("Audio extraction requires a video or audio source.");
    if (
      ["mp4", "mp4_small", "gif", "gif_small", "png", "jpg", "webp"].includes(
        targetFormat,
      ) &&
      isDoc
    )
      throw new Error("Cannot convert document to media format.");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(colors.CORE)
          .setDescription(
            `### ${E_TIME} **Preparing Engine...**\n${E_ARROW} **Source:** *${sourceLabel}*\n${E_ARROW} **Task:** *Downloading...*`,
          ),
      ],
    });
    if (interaction.client.setTempStatus)
      interaction.client.setTempStatus(
        "Converting Media...",
        ActivityType.Watching,
        60000,
      );

    for (let i = 0; i < filesToProcess.length; i++) {
      const f = filesToProcess[i],
        p = path.join(
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
          .setColor(colors.CORE)
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
        let pageImg =
          filesToProcess[0].type?.includes("png") ||
          filesToProcess[0].name.toLowerCase().endsWith(".png")
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([pageImg.width, pageImg.height]);
        page.drawImage(pageImg, {
          x: 0,
          y: 0,
          width: pageImg.width,
          height: pageImg.height,
        });
        fs.writeFileSync(outputPath, await pdfDoc.save());
      }
    } else if (targetFormat === "word_to_pdf") {
      const { value: html } = await mammoth.convertToHtml({
        path: localPaths[0],
      });
      const browser = await chromium.launch({ headless: true }),
        page = await browser.newPage();
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
          "-pix_fmt",
          "yuv420p",
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
          "scale=-2:'min(480,ih)'",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
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
      let stderr = "";
      ffmpegProc.stderr.on("data", (data) => (stderr += data.toString()));
      await new Promise((resolve, reject) => {
        ffmpegProc.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `FFmpeg Failed (Code ${code}). Log: ${stderr.slice(-100)}`,
                ),
              ),
        );
        ffmpegProc.on("error", reject);
      });
    }

    if (interaction.client.clearTempStatus)
      interaction.client.clearTempStatus();
    const stats = fs.statSync(outputPath),
      sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const limitMB = targetFormat === "mp4_small" ? 7.8 : 23;
    const isLarge = stats.size > limitMB * 1024 * 1024;
    const clean = () =>
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);

    if (isLarge) {
      const tunnelLink = getAssetUrl(outputName);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.CORE)
            .setTitle(`${E_FIRE} **Media Delivered**`)
            .setDescription(
              `### ${E_DIAMOND} **Large File Mode**\n${E_ARROW} **Format:** \`${targetFormat.toUpperCase()}\`\n${E_ARROW} **Size:** \`${sizeMB} MB\`\n\n${E_ARROW} **[${E_PING_GREEN} DOWNLOAD VIA CLOUDFLARE](${tunnelLink})**`,
            ),
        ],
      });
      clean();
      setTimeout(
        () => fs.existsSync(outputPath) && fs.unlinkSync(outputPath),
        600000,
      );
    } else {
      await interaction.editReply({
        content: `### ${E_ROCKET} **Conversion Success!**\n${E_ARROW} **Target:** \`${targetFormat.toUpperCase()}\`\n${E_ARROW} **Size:** \`${sizeMB} MB\``,
        files: [new AttachmentBuilder(outputPath, { name: outputName })],
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
      embeds: [],
      components: [],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    localPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
};
