const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const player = require("./player");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { spawn } = require("child_process");
const axios = require("axios");
const cheerio = require("cheerio");

const searchCache = new Map();

const { resolveEmoji } = require("../../utils/emoji-helper");

async function musicHandler(target, manualData = null) {
  const isInteraction =
    !!target.isChatInputCommand || !!target.isStringSelectMenu;
  const guildId = target.guild.id;
  const voiceChannel = target.member.voice.channel;
  const author = isInteraction ? target.user : target.author;

  if (!voiceChannel) {
    const msg = "*You must be in a voice channel first.*";
    return isInteraction
      ? target.reply({ content: msg, flags: [MessageFlags.Ephemeral] })
      : target.reply(msg);
  }

  let url =
    manualData && manualData.url
      ? manualData.url
      : target.content && target.content.match(/https?:\/\/[^\s]+/)
        ? target.content.match(/https?:\/\/[^\s]+/)[0]
        : "";
  let query =
    manualData && manualData.title
      ? manualData.title
      : url
        ? ""
        : target.content || "";

  const source = (manualData && manualData.source) || "yt";

  if (!url && query) {
    const E_PC = resolveEmoji(target.guild, "pc", "📡");
    const E_ROCKET = resolveEmoji(target.guild, "rocket", "🚀");

    const searchingMsg =
      source === "bc"
        ? `${E_PC} *Searching Bandcamp for your tracks...*`
        : `${E_PC} *Searching YouTube... Getting everything ready...*`;

    if (isInteraction) {
      await target.reply({
        content: searchingMsg,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 45000);
    } else await target.reply(searchingMsg);

    let refinedQuery = query;

    let results = [];

    const tryYtSearch = async (prefix, q) => {
      const searchArgs = [
        `${prefix}:${q}`,
        "--dump-json",
        "--flat-playlist",
        ...getCookiesArgs(),
        ...getVpsArgs(),
      ];
      const proc = spawn(getYtDlp(), searchArgs, { env: getDlpEnv() });
      let out = "";
      proc.stdout.on("data", (d) => (out += d));
      await new Promise((r) => proc.on("close", r));
      return out
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch (e) {
            return null;
          }
        })
        .filter((r) => r);
    };

    if (source === "bc") {
      const tryBcSearchLocal = async (q) => {
        const res = [];
        const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(q)}&item_type=t`;
        try {
          const { data } = await axios.get(searchUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            },
          });

          const $ = cheerio.load(data);
          $(".search-result-item, .searchresult, .data-search").each(
            (i, el) => {
              const hrefVal = $(el).find(".heading a").attr("href");
              if (!hrefVal) return;
              const href = hrefVal.split("?")[0];
              const title = $(el).find(".heading a").text().trim();
              const artist =
                $(el).find(".subhead a").last().text().trim() ||
                $(el).find(".subhead").text().trim();

              if (
                href &&
                (href.includes("/track/") || href.includes("/album/"))
              ) {
                if (!res.some((r) => r.webpage_url === href)) {
                  res.push({
                    title,
                    webpage_url: href,
                    uploader: artist || "Bandcamp Artist",
                  });
                }
              }
            },
          );
        } catch (e) {
          console.error("[BC-SEARCH] Error:", e.message);
        }
        return res;
      };

      results = await tryBcSearchLocal(refinedQuery);
    } else {
      let rawResults = await tryYtSearch("ytmsearch10", refinedQuery);
      if (rawResults.length === 0) {
        rawResults = await tryYtSearch("ytsearch10", refinedQuery);
      }
      results = rawResults.filter(r => {
        const isLive = r.is_live || r.live_status === "is_live";
        const duration = r.duration || 0;
        return !isLive && duration <= 3600;
      });
    }

    const filterWords = [
      "remix",
      "cover",
      "fanmade",
      "mashup",
      "reverb",
      "slowed",
      "edit",
      "version",
      "sped up",
      "lyrics",
    ];

    const noisePatterns = [
      /\s*[\(\[][^)\]]*[\)\]]/g,
      /\s*[-|:]?\s*(?:official|lyrics|video|audio|hd|4k|hq|music video|visualizer|full video|lyric video)[^\s]*/gi,
      /\|\s*Official\s*(Music\s*)?Video/gi,
    ];

    const cleanTitle = (txt) => {
      let cleaned = txt;
      noisePatterns.forEach((p) => (cleaned = cleaned.replace(p, "")));
      return cleaned.replace(/\s\s+/g, " ").trim();
    };

    const containsFilter = (txt) =>
      filterWords.some((w) => txt.toLowerCase().includes(w));
    const queryContainsFilter = filterWords.some((w) =>
      query.toLowerCase().includes(w),
    );

    results = results.map((r) => ({
      ...r,
      title: r.title,
    }));

    if (!queryContainsFilter && results.length > 0) {
      const filtered = results.filter((r) => !containsFilter(r.title));
      if (filtered.length > 0) results = filtered;
    }

    if (results.length === 0) {
      const errorMsg = `*No music found for your query on ${source === "bc" ? "Bandcamp" : "YouTube"}.*`;
      if (isInteraction) {
        await target.editReply({ content: errorMsg });
        setTimeout(() => target.deleteReply().catch(() => {}), 5000);
      } else {
        await target.reply(errorMsg);
      }
      return;
    }

    const guild = target.guild;
    const E_FIRE = resolveEmoji(guild, "purple_fire", "🔥");
    const E_ARROW = resolveEmoji(guild, "arrow", "»");

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`music_select_${author.id}`)
      .setPlaceholder("Select a track...")
      .addOptions(
        results.slice(0, 25).map((r, index) => {
          const shortId = `tr_${author.id}_${Date.now()}_${index}`;
          searchCache.set(shortId, { url: r.webpage_url, title: r.title });

          setTimeout(() => searchCache.delete(shortId), 600000);

          let labelText =
            r.title.length > 100 ? r.title.substring(0, 97) + "..." : r.title;

          const cleanUploader = (r.uploader || "Unknown Author")
            .replace(/\n/g, " ")
            .replace(/\s\s+/g, " ")
            .trim();

          return {
            label: labelText,
            description: `By ${cleanUploader}`.substring(0, 100),
            value: shortId,
            emoji: E_ARROW,
          };
        }),
      );

    const row = new ActionRowBuilder().addComponents(menu);

    if (isInteraction) {
      await target.editReply({
        content: `### ${E_FIRE} Found **${results.length}** results. Select one within 45 seconds:`,
        components: [row],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 45000);
    } else {
      await target.reply({
        content: `### ${E_FIRE} Found **${results.length}** results for: **${query}**`,
        components: [row],
      });
    }
    return;
  }

  if (!url) return;

  await player.play(target, url, query);
}

module.exports = {
  musicHandler,
  player,
  searchCache,
};
