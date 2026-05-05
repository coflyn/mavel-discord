const { EmbedBuilder, MessageFlags } = require("discord.js");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("../../utils/http");
const colors = require("../../utils/embed-colors");
const { getTempDir } = require("../../utils/filetools");
const { resolveEmoji } = require("../../utils/emoji-helper");
const config = require("../../config");

module.exports = async function inspectorHandler(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    let filesToProcess = [];
    let sourceLabel = "Uploaded File";

    if (interaction.isChatInputCommand()) {
      const uploadedFile = interaction.options.getAttachment("file");
      if (uploadedFile)
        filesToProcess.push({
          url: uploadedFile.url,
          name: uploadedFile.name,
          type: uploadedFile.contentType,
        });
    } else if (interaction.isMessageContextMenuCommand()) {
      const targetMsg = interaction.targetMessage;
      let currentMsg = targetMsg;
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
          const botBanner = config.botBanner || "";
          currentMsg.embeds.forEach((embed) => {
            const mediaUrl =
              embed.image?.url ||
              embed.video?.url ||
              embed.thumbnail?.url ||
              embed.url;

            if (
              mediaUrl &&
              mediaUrl.startsWith("http") &&
              (!botBanner || !mediaUrl.includes(botBanner))
            ) {
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

    if (filesToProcess.length === 0)
      throw new Error("No media file detected to inspect.");

    const getEmoji = (name, fallback) =>
      resolveEmoji(interaction, name, fallback);

    const E_TIME = getEmoji("time", "⌛");
    const E_INFO = getEmoji("anno", "ℹ️");
    const E_DIAMOND = getEmoji("diamond", "💎");
    const E_ARROW = getEmoji("arrow", "•");
    const E_PC = getEmoji("pc", "💻");
    const E_MAP = getEmoji("notif", "📍");
    const E_FIRE = getEmoji("purple_fire", "🔥");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(colors.CORE)
          .setDescription(
            `### ${E_TIME} **Reading Media...**\n*MaveL is analyzing details...*`,
          ),
      ],
    });

    const rootTempDir = getTempDir();
    const inputPath = path.join(
      rootTempDir,
      `inspect_${Date.now()}_${filesToProcess[0].name.replace(/[^\w.-]/g, "_")}`,
    );

    const res = await http.get(filesToProcess[0].url, {
      responseType: "stream",
    });
    const writer = fs.createWriteStream(inputPath);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const ffprobe = spawn("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => (output += data.toString()));
    await new Promise((resolve) => {
      ffprobe.on("close", resolve);
    });

    const data = JSON.parse(output);
    const format = data.format || {};
    const streams = data.streams || [];
    const vStream = streams.find((s) => s.codec_type === "video");
    const aStream = streams.find((s) => s.codec_type === "audio");

    let locationLink = null;
    if (format.tags) {
      const lat =
        format.tags["location"] ||
        format.tags["com.apple.quicktime.location.ISO6709"] ||
        format.tags["GPSLatitude"];
      const lon = format.tags["GPSLongitude"];

      if (lat && lon) {
        locationLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      } else if ((lat && lat.includes("+")) || (lat && lat.includes("-"))) {
        const match = lat.match(/([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
        if (match)
          locationLink = `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[2]}`;
      }
    }

    const size = (format.size / (1024 * 1024)).toFixed(2) + " MB";
    const duration = format.duration
      ? parseFloat(format.duration).toFixed(2) + " Secs"
      : "Static";

    const embed = new EmbedBuilder()
      .setColor(colors.CORE)
      .setAuthor({
        name: "Media Details",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setThumbnail(filesToProcess[0].url)
      .setDescription(
        `### ${E_FIRE} **Technical Info**\n` +
          `${E_ARROW} **Filename:** \`${filesToProcess[0].name.slice(0, 30)}\`\n` +
          `${E_ARROW} **Container:** \`${format.format_name?.toUpperCase()}\`\n` +
          `${E_ARROW} **Size:** \`${size}\` | **Length:** \`${duration}\``,
      );

    if (vStream) {
      embed.addFields({
        name: `${E_PC} **Video Details**`,
        value: `> Resolution: \`${vStream.width}x${vStream.height}\`\n> Codec: \`${vStream.codec_name.toUpperCase()}\`\n> Frame Rate: \`${vStream.r_frame_rate} FPS\``,
        inline: false,
      });
    }

    if (aStream) {
      embed.addFields({
        name: `🎵 **Audio Details**`,
        value: `> Codec: \`${aStream.codec_name.toUpperCase()}\`\n> Channels: \`${aStream.channels || 2}\``,
        inline: false,
      });
    }

    if (locationLink) {
      embed.addFields({
        name: `${E_MAP} **Geolocation Detected**`,
        value: `> **[View on Google Maps](${locationLink})**\n> *Coordinates found in hidden details.*`,
        inline: false,
      });
    }

    if (format.tags) {
      let intelStr = "";
      const priorityTags = [
        "make",
        "model",
        "software",
        "creation_time",
        "encoder",
        "author",
        "copyright",
        "iso",
        "f_number",
        "exposure_time",
      ];
      for (const [key, value] of Object.entries(format.tags)) {
        if (priorityTags.includes(key.toLowerCase())) {
          intelStr += `> ${key}: \`${value}\`\n`;
        }
      }
      if (intelStr) {
        embed.addFields({
          name: `${E_INFO} **Detailed Info**`,
          value: intelStr.slice(0, 1024),
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  } catch (err) {
    console.error("[INSPECT] Error:", err.message);
    const E_ERROR = resolveEmoji(interaction, "ping_red", "🔴");
    await interaction.editReply({
      content: `### ${E_ERROR} **Something went wrong**\n> *Error: ${err.message}*`,
      embeds: [],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }
};
