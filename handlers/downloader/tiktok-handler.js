const http = require("../../utils/http");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { createJob, createHandlerContext, formatNumber } = require("./core-helpers");
const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runTikTokFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  await ctx.init("TikTok Search", "Looking for video...");

  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const res = await http.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`,
      { timeout: 25000 }
    );

    const data = res.data;
    if (data.code !== 0)
      throw new Error(data.msg || "TikWM extraction failed.");

    const tik = data.data;
    const title = tik.title || "TikTok Content";
    const author = tik.author?.nickname || "Anonymous";
    const cover = tik.cover;
    const images = tik.images || [];
    const isGallery = images.length > 0;

    const formatUrl = (u) =>
      u && !u.startsWith("http") ? `https://www.tikwm.com${u}` : u;
    const jobId = createJob(target, {
      url: cleanUrl,
      title: title + (author ? ` (@${author})` : ""),
      stats: {
        likes: tik.digg_count || 0,
        views: tik.play_count || 0,
        comments: tik.comment_count || 0,
        shares: tik.share_count || 0,
        duration: tik.duration || "0:00",
        uploader: author,
      },
      thumbnail: formatUrl(cover),
      platform: "TikTok",
      isGallery,
      hasVideo: !!tik.play,
      isVideo: !!tik.play,
      extractor: "tikwm-api",
      directUrl: formatUrl(tik.play),
      musicUrl: formatUrl(tik.music || tik.music_info?.play),
      images: images.map((i) => formatUrl(i)),
    });

    const botUser = await target.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const LEA = ctx.getEmoji("ping_green", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.SOCIAL)
      .setTitle(`${NOTIF} **TikTok Found**`)
      .setThumbnail(formatUrl(cover))
      .setDescription(
        `### ${LEA} *Link Found*\n` +
          `${ctx.ARROW} **Topic:** *${title.substring(0, 100)}*\n` +
          `${ctx.ARROW} **Author:** *${author}*\n` +
          `${ctx.ARROW} **Quality:** *HD (No Watermark)*\n\n` +
          `*${formatNumber(tik.digg_count)} Likes  •  ${formatNumber(tik.comment_count)} Comments  •  ${formatNumber(tik.play_count)} Views*`,
      )
      .setFooter({
        text: "MaveL",
        iconURL: target.client.user.displayAvatarURL(),
      });

    const components = [];
    if (options.isCommand) {
      const row = new ActionRowBuilder();
      if (isGallery) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_tkgallery_${jobId}`)
            .setLabel(`GALLERY (${images.length} PHOTOS)`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`dl_tkmp3_${jobId}`)
            .setLabel("AUDIO (MP3)")
            .setStyle(ButtonStyle.Success),
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_tkmp4_${jobId}`)
            .setLabel("VIDEO (HD)")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`dl_tkmp3_${jobId}`)
            .setLabel("AUDIO (MP3)")
            .setStyle(ButtonStyle.Success),
        );
      }
      components.push(row);
    }

    if (options.isCommand && options.type) {
      const finalFormat =
        options.type === "mp3" ? "tkmp3" : isGallery ? "tkgallery" : "tkmp4";
      return await startDownload(target, jobId, finalFormat, { statusMsg: ctx.statusMsg });
    }

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed], components });
    return { jobId, isGallery, statusMsg: resMsg };
  } catch (e) {
    console.error("[TIKTOK-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "TikTok Video Not Found",
          e.message || "Download blocked.",
        ),
      ],
    });
  }
}

module.exports = { runTikTokFlow };
