const axios = require("axios");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

const { startDownload } = require("./callbacks");
const colors = require("../../utils/embed-colors");

async function runSpotifyFlow(target, url, options = {}) {
    const ctx = createHandlerContext(target, options);
    await ctx.init("Spotify Search", "Looking up track on YouTube...");

    try {
        const cleanUrl = url.split("?")[0].split("#")[0];
        const oEmbed = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(cleanUrl)}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 5000
        });

        const artist = oEmbed.data.author_name || "Unknown Artist";
        const trackName = (oEmbed.data.title || "").split(" - song")[0].trim();
        const title = `${artist} - ${trackName}`;
        const thumbnail = oEmbed.data.thumbnail_url;
        const jobId = createJob(target, {
            url: cleanUrl,
            title: title,
            stats: { likes: "---", views: "---", comments: "---", shares: "---", duration: "Track", uploader: artist },
            thumbnail,
            platform: "Spotify (Matched)",
            isGallery: false,
            hasVideo: false,
            extractor: "spotify-meta",
            searchQuery: `${title} official audio`
        });

        const botUser = await target.client.user.fetch();
        const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

        const LEA = ctx.getEmoji("ping_green", "✅");
        const NOTIF = ctx.getEmoji("notif", "🔔");

        const foundEmbed = new EmbedBuilder()
            .setColor(colors.MUSIC_DL)
            .setTitle(`${NOTIF} **Spotify Link Found**`)
            .setThumbnail(thumbnail)
            .setDescription(
                `### ${LEA} *Link Found*\n` +
                `${ctx.ARROW} **Track:** *${trackName}*\n` +
                `${ctx.ARROW} **Artist:** *${artist}*\n` +
                `${ctx.ARROW} **Type:** *Song Info*\n\n` +
                `*Song found and ready to download.*`
            )
            .setFooter({
                text: "MaveL Spotify Extractor",
                iconURL: target.client.user.displayAvatarURL()
            });

        if (options.isCommand && options.type) {
            return await startDownload(target, jobId, "spmp3", { statusMsg });
        }

        await ctx.editResponse({ embeds: [foundEmbed] });
        return { jobId, statusMsg: ctx.statusMsg };

    } catch (e) {
        console.error("[SPOTIFY-FLOW] Error:", e.message);
        await ctx.editResponse({
            embeds: [ctx.statusEmbed("Spotify Error", "Could not get info from Spotify servers.")]
        });
    }
}

module.exports = { runSpotifyFlow };
