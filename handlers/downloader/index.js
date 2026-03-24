const { EmbedBuilder, MessageFlags } = require("discord.js");
const { runYtDlpFlow } = require("./core");
const { handleDownloadCallback } = require("./callbacks");
const config = require("../../config");

module.exports = async function downloaderHandler(target, manualOptions = {}) {
  let url = manualOptions.manualUrl || "";
  let type = manualOptions.manualType || null;
  let resolution = manualOptions.manualResolution || null;

  if (manualOptions.manualUrl) {
    type = manualOptions.manualType || "mp4";
    resolution = manualOptions.manualResolution || "720";
  } else if (
    target.options &&
    target.isChatInputCommand &&
    target.isChatInputCommand()
  ) {
    url = target.options.getString("url");
    type = target.options.getString("type") || "mp4";
    resolution = target.options.getString("resolution") || "720";
  } else {
    const text = target.content || "";
    if (!text) return;
    const linkMatch = text.match(/https?:\/\/[^\s]+/);
    if (!linkMatch) return;
    url = linkMatch[0];

    type = "mp4";
    resolution = "720";
  }

  if (!url) {
    const guildEmojis = await target.guild.emojis.fetch();
    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", "•");
    const ANNO = getEmoji("anno", "🚀");
    const PC = getEmoji("pc", "📱");
    const CAMERA = getEmoji("camera", "🎨");
    const DOTS = getEmoji("three_dots", "🎵");
    const COIN = getEmoji("coin", "☁️");
    const FIRE = getEmoji("purple_fire", "✨");

    const botUser = await target.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor("#5d3fd3")
      .setAuthor({
        name: "MaveL Downloader System",
        iconURL: target.client.user.displayAvatarURL(),
      })
      .setTitle(`${ANNO} **Supported Platform Engine**`)
      .setImage(botBanner)
      .setDescription(
        `*Universal dataset parser capable of processing visual & audio streams across the web.*`,
      )
      .addFields(
        {
          name: `${PC} **Video & Socials**`,
          value: `${ARROW} *TikTok, Instagram, YouTube, FB, X, Threads*`,
          inline: false,
        },
        {
          name: `${CAMERA} **Artistic & Creative**`,
          value: `${ARROW} *Pinterest, Pixiv*`,
          inline: false,
        },
        {
          name: `${DOTS} **Acoustic & Music**`,
          value: `${ARROW} *YouTube Music, SoundCloud, Spotify*`,
          inline: false,
        },
        {
          name: `${COIN} **Storage & Cloud**`,
          value: `${ARROW} *Mediafire, MEGA, GDrive*`,
          inline: false,
        },
        {
          name: `${FIRE} **Archival & Docs**`,
          value: `${ARROW} *Slideshare, Docplayer*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL",
        iconURL: target.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    if (target.reply) {
      const reply = await target.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });
      setTimeout(() => {
        if (target.deleteReply) target.deleteReply().catch(() => {});
        else if (reply && reply.delete) reply.delete().catch(() => {});
      }, 60000);
      return;
    }
    return;
  }

  await runYtDlpFlow(target, url, { type, resolution });
};

module.exports.handleDownloadCallback = handleDownloadCallback;
module.exports.runYtDlpFlow = runYtDlpFlow;
