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
const http = require("../../utils/http");
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
    if (isInteraction) {
      await target.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
      return setTimeout(() => target.deleteReply().catch(() => {}), 10000);
    }
    return target.reply(msg);
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
    const E_PC = resolveEmoji(target, "pc", "📡");
    const E_ROCKET = resolveEmoji(target, "rocket", "🚀");

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
        try {
          const homeRes = await http.get("https://bandcamp.com/", {
            headers: {
              Accept: "text/html",
              Referer: "https://bandcamp.com/",
            },
          });

          const $home = cheerio.load(homeRes.data);
          const crumbsData = $home("#js-crumbs-data").attr("data-crumbs");
          let crumb = null;

          if (crumbsData) {
            try {
              const crumbs = JSON.parse(crumbsData);
              crumb =
                crumbs["BcSearch/1/autosuggest"] || Object.values(crumbs)[0];
            } catch (e) {}
          }

          if (!crumb) {
            console.warn(
              "[BC-SEARCH] Failed to extract security crumb. Falling back...",
            );
            return [];
          }

          const apiRes = await http.post(
            "https://bandcamp.com/api/bcsearch/1/autosuggest",
            {
              search_text: q,
              search_filter: "t",
              full_page: false,
              size: 15,
            },
            {
              headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-BC-Crumb": crumb,
                Referer: "https://bandcamp.com/",
              },
            },
          );

          if (apiRes.data && apiRes.data.auto && apiRes.data.auto.results) {
            apiRes.data.auto.results.forEach((item) => {
              if (
                item.item_type_letter === "t" ||
                item.item_type_letter === "a"
              ) {
                res.push({
                  title: item.name,
                  webpage_url: item.url,
                  uploader: item.band_name || "Bandcamp Artist",
                  thumbnail: item.img || null,
                });
              }
            });
          }
        } catch (e) {
          console.error("[BC-SEARCH] API Error:", e.message);
        }
        return res;
      };

      results = await tryBcSearchLocal(refinedQuery);

      if (results.length === 0) {
        console.log(
          "[BC-SEARCH] No results or blocked. Falling back to YouTube...",
        );
        let fallbackResults = await tryYtSearch(
          "ytsearch10",
          `${refinedQuery} bandcamp`,
        );
        results = fallbackResults.map((r) => ({
          ...r,
          title: `[BC-Fallback] ${r.title}`,
        }));
      }
    } else {
      let rawResults = await tryYtSearch("ytmsearch10", refinedQuery);
      if (rawResults.length === 0) {
        rawResults = await tryYtSearch("ytsearch10", refinedQuery);
      }
      results = rawResults.filter((r) => {
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
