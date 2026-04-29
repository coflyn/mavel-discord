const axios = require("axios");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

const { startDownload } = require("./callbacks");

async function runSpotifyFlow(target, url, options = {}) {
    const guild = target.guild || target.client?.guilds?.cache.first();
    const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "🔥");

    let statusMsg;
    const _editResponse = async (data) => await editResponse(target, statusMsg, data);

    if (options.statusMsg) {
        statusMsg = options.statusMsg;
        await _editResponse({
            embeds: [getStatusEmbed(guild, "Spotify Search", "Looking up track on YouTube...")],
        }).catch(() => {});
    } else {
        statusMsg = await sendInitialStatus(target, "Spotify Search", "Looking up track on YouTube...");
    }

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
        const jobId = Math.random().toString(36).substring(2, 10);

        const db = loadDB();
        db.jobs[jobId] = {
            url: cleanUrl,
            timestamp: Date.now(),
            title: title,
            stats: { likes: "---", views: "---", comments: "---", shares: "---", duration: "Track", uploader: artist },
            thumbnail,
            platform: "Spotify (Matched)",
            userId: target.user ? target.user.id : target.author.id,
            isGallery: false,
            hasVideo: false,
            extractor: "spotify-meta",
            searchQuery: `${title} official audio`
        };
        saveDB(db);

        const botUser = await target.client.user.fetch();
        const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

        const LEA = getEmoji("lea", "getEmoji('ping_green', '✅')");
        const NOTIF = getEmoji("notif", "🔔");

        const foundEmbed = new EmbedBuilder()
            .setColor("#00b894")
            .setTitle(`${NOTIF} **Spotify Link Found**`)
            .setThumbnail(thumbnail)
            .setDescription(
                `### ${LEA} *Link Found*\n` +
                `${ARROW} **Track:** *${trackName}*\n` +
                `${ARROW} **Artist:** *${artist}*\n` +
                `${ARROW} **Type:** *Song Info*\n\n` +
                `*Song found and ready to download.*`
            )
            .setFooter({
                text: "MaveL Spotify Extractor",
                iconURL: target.client.user.displayAvatarURL()
            });

        if (options.isCommand && options.type) {
            return await startDownload(target, jobId, "spmp3", { statusMsg });
        }

        await _editResponse({ embeds: [foundEmbed] });
        return { jobId, statusMsg };

    } catch (e) {
        console.error("[SPOTIFY-FLOW] Error:", e.message);
        await _editResponse({
            embeds: [getStatusEmbed(guild, "Spotify Error", "Could not get info from Spotify servers.")]
        });
    }
}

module.exports = { runSpotifyFlow };
