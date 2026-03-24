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
    const searchingMsg =
      source === "bc"
        ? "*Searching Bandcamp (Spotify Meta)...*"
        : "*Searching YouTube Music (Spotify Meta)...*";

    if (isInteraction) {
      await target.reply({
        content: searchingMsg,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 15000);
    } else await target.reply(searchingMsg);

    let refinedQuery = query;

    try {
      const spotUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query + " site:open.spotify.com/track")}`;
      const { data: spotData } = await axios.get(spotUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const $s = cheerio.load(spotData);
      const topResult = $s(".result__a").first().text().trim();
      if (topResult && topResult.includes("song and lyrics")) {
        const parts = topResult.split(" - ");
        if (parts.length > 0) {
          refinedQuery = parts[0].trim();
          console.log(`[MUSIC-META] Refined via Spotify: ${refinedQuery}`);
        }
      }
    } catch (e) {
      console.error("[MUSIC-META] Spotify refinement error:", e.message);
    }

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
        const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(q + " site:bandcamp.com")}`;
        try {
          const { data } = await axios.get(searchUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout: 10000,
          });

          const $ = cheerio.load(data);
          $("a").each((i, el) => {
            let href = $(el).attr("href");
            if (
              href &&
              (href.includes(".bandcamp.com/track/") ||
                href.includes(".bandcamp.com/album/"))
            ) {
              const urlParts = new URL(href);
              const artistName = urlParts.hostname.split(".")[0];
              const titleSlug = urlParts.pathname
                .split("/")
                .pop()
                .replace(/-/g, " ");

              let title =
                titleSlug.charAt(0).toUpperCase() + titleSlug.slice(1);
              if (q && titleSlug.includes(q.toLowerCase().split(" ")[0])) {
                title = q;
              }

              if (title && !res.some((r) => r.webpage_url === href)) {
                res.push({
                  title: title,
                  webpage_url: href,
                  uploader:
                    artistName.charAt(0).toUpperCase() + artistName.slice(1),
                });
              }
            }
          });
        } catch (e) {}
        return res;
      };

      results = await tryBcSearchLocal(refinedQuery);
    } else {
      results = await tryYtSearch("ytmsearch10", refinedQuery);
      if (results.length === 0) {
        results = await tryYtSearch("ytsearch10", refinedQuery);
      }
    }

    const filterWords = ["remix", "cover", "fanmade", "mashup", "reverb"];
    const containsFilter = (txt) =>
      filterWords.some((w) => txt.toLowerCase().includes(w));
    const queryContainsFilter = filterWords.some((w) =>
      query.toLowerCase().includes(w),
    );

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

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`music_select_${author.id}`)
      .setPlaceholder("Select a track...")
      .addOptions(
        results.slice(0, 5).map((r, index) => {
          const shortId = `tr_${author.id}_${Date.now()}_${index}`;
          searchCache.set(shortId, { url: r.webpage_url, title: r.title });

          // Auto-cleanup after 10 minutes
          setTimeout(() => searchCache.delete(shortId), 600000);

          return {
            label:
              r.title.length > 100 ? r.title.substring(0, 97) + "..." : r.title,
            description: r.uploader ? `By ${r.uploader}` : "",
            value: shortId,
          };
        }),
      );

    const row = new ActionRowBuilder().addComponents(menu);

    const content = `*Found ${results.length} results for: ${query} (${source.toUpperCase()})*`;
    if (isInteraction) {
      await target.editReply({
        content: `*Found ${results.length} results. Select one within 45 seconds:*`,
        components: [row],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 45000);
    } else {
      await target.reply({ content, components: [row] });
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
