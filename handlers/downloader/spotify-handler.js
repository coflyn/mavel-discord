const axios = require("axios");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");

async function runSpotifyFlow(target, url, options = {}) {
    let statusMsg = options.statusMsg;
    const guild = target.guild || target.client?.guilds?.cache.first();
    const guildEmojis = guild ? await guild.emojis.fetch().catch(() => null) : null;
    const getEmoji = (name, fallback) => {
        const emoji = guildEmojis?.find((e) => e.name === name);
        return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "🔥");

    const getStatusEmbed = (status, details) => {
        return new EmbedBuilder()
            .setColor("#00b894")
            .setDescription(`### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`);
    };

    const initialEmbed = getStatusEmbed("Spotify Search", "Looking up track on YouTube...");

    if (!statusMsg) {
        if (target.replied || target.deferred) {
            statusMsg = await target.editReply({ embeds: [initialEmbed], withResponse: true });
        } else if (target.isChatInputCommand && target.isChatInputCommand()) {
            statusMsg = await target.reply({ embeds: [initialEmbed], flags: [MessageFlags.Ephemeral], withResponse: true });
        } else {
            statusMsg = target.reply
                ? await target.reply({ embeds: [initialEmbed], withResponse: true })
                : await target.channel.send({ embeds: [initialEmbed] });
        }
    } else {
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        if (msg && msg.edit) await msg.edit({ embeds: [initialEmbed] }).catch(() => {});
    }

    const editResponse = async (data) => {
        try {
            const payload = typeof data === "string" ? { content: data } : data;
            if (target.editReply) {
                return await target.editReply(payload);
            } else {
                const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
                return await msg.edit(payload);
            }
        } catch (e) {
            console.error("[SPOTIFY-EDIT] Error:", e.message);
        }
    };

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

        const LEA = getEmoji("lea", "✅");
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

        await editResponse({ embeds: [foundEmbed] });
        return { jobId, statusMsg };

    } catch (e) {
        console.error("[SPOTIFY-FLOW] Error:", e.message);
        await editResponse({
            embeds: [getStatusEmbed("Spotify Error", "Could not get info from Spotify servers.")]
        });
    }
}

module.exports = { runSpotifyFlow };
