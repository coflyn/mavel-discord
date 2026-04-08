const axios = require("axios");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { loadDB, saveDB, formatNumber } = require("./core-helpers");
const { startDownload } = require("./callbacks");

async function runTikTokFlow(target, url, options = {}) {
    let statusMsg;
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
            .setColor("#e17055")
            .setDescription(`### ${FIRE} **${status}**\n${ARROW} **Details:** *${details}*`);
    };

    const initialEmbed = getStatusEmbed("TikTok Research", "Identifying high-res data...");

    if (options.statusMsg) {
        statusMsg = options.statusMsg;
        const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
        if (msg && msg.edit) await msg.edit({ embeds: [initialEmbed] }).catch(() => {});
    } else {
        if (target.replied || target.deferred) {
            statusMsg = await target.editReply({ embeds: [initialEmbed], withResponse: true });
        } else if (target.isChatInputCommand && target.isChatInputCommand()) {
            statusMsg = await target.reply({ embeds: [initialEmbed], flags: [MessageFlags.Ephemeral], withResponse: true });
        } else {
            statusMsg = target.reply
                ? await target.reply({ embeds: [initialEmbed], withResponse: true })
                : await target.channel.send({ embeds: [initialEmbed] });
        }
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
            console.error("[TIKTOK-EDIT] Error:", e.message);
        }
    };

    try {
        const cleanUrl = url.split("?")[0].split("#")[0];
        const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`, {
            timeout: 10000
        });

        const data = res.data;
        if (data.code !== 0) throw new Error(data.msg || "TikWM extraction failed.");

        const tik = data.data;
        const jobId = Math.random().toString(36).substring(2, 10);
        const title = tik.title || "TikTok Content";
        const author = tik.author?.nickname || "Anonymous";
        const cover = tik.cover;
        const images = tik.images || [];
        const isGallery = images.length > 0;
        
        const formatUrl = (u) => u && !u.startsWith("http") ? `https://www.tikwm.com${u}` : u;

        const db = loadDB();
        db.jobs[jobId] = {
            url: cleanUrl,
            timestamp: Date.now(),
            title: title + (author ? ` (@${author})` : ""),
            stats: { 
                likes: tik.digg_count || 0, 
                views: tik.play_count || 0, 
                comments: tik.comment_count || 0, 
                shares: tik.share_count || 0, 
                duration: tik.duration || "0:00", 
                uploader: author 
            },
            thumbnail: formatUrl(cover),
            platform: "TikTok",
            userId: target.user ? target.user.id : target.author.id,
            isGallery,
            hasVideo: !!tik.play,
            extractor: "tikwm-api",
            directUrl: formatUrl(tik.play),
            musicUrl: formatUrl(tik.music || tik.music_info?.play),
            images: images.map(i => formatUrl(i))
        };
        saveDB(db);

        const botUser = await target.client.user.fetch();
        const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

        const LEA = getEmoji("lea", "✅");
        const NOTIF = getEmoji("notif", "🔔");

        const foundEmbed = new EmbedBuilder()
            .setColor("#e17055")
            .setTitle(`${NOTIF} **TikTok Signal Secured**`)
            .setThumbnail(formatUrl(cover))
            .setDescription(
                `### ${LEA} *Resource Identified*\n` +
                `${ARROW} **Topic:** *${title.substring(0, 100)}*\n` +
                `${ARROW} **Author:** *${author}*\n` +
                `${ARROW} **Quality:** *No-Watermark Secure*\n\n` +
                `*${formatNumber(tik.digg_count)} Likes  •  ${formatNumber(tik.comment_count)} Comments  •  ${formatNumber(tik.play_count)} Views*`
            )
            .setFooter({
                text: "MaveL TikTok Resolver",
                iconURL: target.client.user.displayAvatarURL()
            });

        const components = [];
        if (options.isCommand) {
            const row = new ActionRowBuilder();
            if (isGallery) {
                row.addComponents(
                    new ButtonBuilder().setCustomId(`dl_tkgallery_${jobId}`).setLabel(`GALLERY (${images.length} PHOTOS)`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`dl_tkmp3_${jobId}`).setLabel("AUDIO (MP3)").setStyle(ButtonStyle.Success)
                );
            } else {
                row.addComponents(
                    new ButtonBuilder().setCustomId(`dl_tkmp4_${jobId}`).setLabel("VIDEO (HD)").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`dl_tkmp3_${jobId}`).setLabel("AUDIO (MP3)").setStyle(ButtonStyle.Success)
                );
            }
            components.push(row);
        }

        if (options.isCommand && options.type) {
            const finalFormat = options.type === "mp3" ? "tkmp3" : (isGallery ? "tkgallery" : "tkmp4");
            return await startDownload(target, jobId, finalFormat, { statusMsg });
        }

        const resMsg = await editResponse({ embeds: [foundEmbed], components });
        return { jobId, isGallery, statusMsg: resMsg };

    } catch (e) {
        console.error("[TIKTOK-FLOW] Error:", e.message);
        await editResponse({
            embeds: [getStatusEmbed("TikTok Identification Failed", e.message || "Extraction blocked.")]
        });
    }
}

module.exports = { runTikTokFlow };
