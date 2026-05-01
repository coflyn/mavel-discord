const { spawn } = require("child_process");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const axios = require("axios");
const config = require("../../config");
const { resolveEmoji } = require("../../utils/emoji-helper");
const cheerio = require("cheerio");
const colors = require("../../utils/embed-colors");
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCachedResults(query) {
  const cached = searchCache.get(query);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    searchCache.delete(query);
    return null;
  }
  return cached.results;
}

function setCacheResults(query, results) {
  if (searchCache.size > 100) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(query, { results, timestamp: Date.now() });
}

module.exports = async function searchHandler(interaction) {
  const query = interaction.options.getString("query");
  const typeSelection = interaction.options.getString("type") || "yt";

  if (interaction.deferReply) {
    await interaction
      .deferReply({ flags: [MessageFlags.Ephemeral] })
      .catch((e) => console.error("[SEARCH-DEFER]", e.message));
    if (interaction.client.setTempStatus) {
      interaction.client.setTempStatus(
        `Searching ${typeSelection.toUpperCase()}...`,
        3,
        10000,
      );
    }
  }

  const getEmoji = (name, fallback) => resolveEmoji(interaction.guild, name, fallback);

  const ARROW = getEmoji("arrow", "•");
  const FIRE = getEmoji("purple_fire", "🔥");
  const SEARCH = getEmoji("lea", "🔎");
  const DOTS = getEmoji("three_dots", "🎵");
  const PING_RED = getEmoji("ping_red", "🔴");

  if (!query) {
    const botUser = await interaction.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(colors.SEARCH)
      .setAuthor({
        name: "MaveL Search",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${SEARCH} **Find your media**`)
      .setImage(botBanner)
      .setDescription(`*Type what you're looking for to find videos or music.*`)
      .addFields(
        {
          name: `${FIRE} **Visuals**`,
          value: `${ARROW} *YouTube (Video Download)*`,
          inline: false,
        },
        {
          name: `${DOTS} **Music**`,
          value:
            `${ARROW} *YouTube Music (Audio Download)*\n` +
            `${ARROW} *Spotify (Get Track Info)*\n` +
            `${ARROW} *Bandcamp (Original Info)*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL | Select Option Above",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await (interaction.deferred
      ? interaction.editReply({
          embeds: [embed],
        })
      : interaction.reply({
          embeds: [embed],
          flags: [MessageFlags.Ephemeral],
        }));

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);

    return;
  }

  let finalResults = getCachedResults(query);
  if (finalResults) {
    if (interaction.client.clearTempStatus)
      interaction.client.clearTempStatus();
    return await displaySearchResults(
      interaction,
      query,
      finalResults,
      typeSelection,
      { ARROW, FIRE, SEARCH, DOTS, PING_RED },
      query,
    );
  }

  let refinedQuery = query;

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

  if (typeSelection === "bc") {
    const tryBcSearch = async (q) => {
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
        $(".search-result-item, .searchresult, .data-search").each((i, el) => {
          const hrefVal = $(el).find(".heading a").attr("href");
          if (!hrefVal) return;
          const href = hrefVal.split("?")[0];
          const title = $(el).find(".heading a").text().trim();
          const artist =
            $(el).find(".subhead a").last().text().trim() ||
            $(el).find(".subhead").text().trim();

          if (href && (href.includes("/track/") || href.includes("/album/"))) {
            if (!res.some((r) => r.webpage_url === href)) {
              res.push({
                title,
                webpage_url: href,
                uploader: artist || "Bandcamp Artist",
              });
            }
          }
        });
      } catch (e) {
        console.error("[BC-SEARCH] Error:", e.message);
      }
      return res.slice(0, 20);
    };
    finalResults = await tryBcSearch(refinedQuery);
  } else if (typeSelection === "spot") {
    const trySpotSearch = async (q) => {
      const res = [];
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q + " site:open.spotify.com/track")}`;
      try {
        const { data } = await axios.get(searchUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          },
        });
        const $ = cheerio.load(data);
        $(".result__a, .result__title a, a[data-testid='result-title-a']").each(
          (i, el) => {
            let href = $(el).attr("href");

            if (href && href.includes("uddg=")) {
              try {
                const urlParams = new URL(href, "https://duckduckgo.com")
                  .searchParams;
                const uddg = urlParams.get("uddg");
                if (uddg) href = decodeURIComponent(uddg);
              } catch (e) {}
            } else if (href && href.startsWith("//duckduckgo.com/l/")) {
              try {
                const parts = href.split("uddg=");
                if (parts.length > 1) {
                  href = decodeURIComponent(parts[1].split("&")[0]);
                }
              } catch (e) {}
            }

            if (href && href.includes("open.spotify.com/track/")) {
              const title = $(el).text().split(" - ")[0].trim();
              const artist =
                $(el).text().split(" - ")[1]?.split("|")[0].trim() ||
                "Spotify Artist";
              if (!res.some((r) => r.webpage_url === href)) {
                res.push({ title, webpage_url: href, uploader: artist });
              }
            }
          },
        );
      } catch (e) {}
      return res.slice(0, 10);
    };
    finalResults = await trySpotSearch(refinedQuery);
  } else if (typeSelection === "ytm") {
    finalResults = await tryYtSearch("ytmsearch10", refinedQuery);
    if (finalResults.length === 0) {
      finalResults = await tryYtSearch("ytsearch10", refinedQuery);
    }
  } else {
    finalResults = await tryYtSearch("ytsearch10", refinedQuery);
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
    /\((Official|Music|Lyric|Video|HD|4K|Audio|Visualizer)[^)]*\)/gi,
    /\[(Official|Music|Lyric|Video|HD|4K|Audio|Visualizer)[^\]]*\]/gi,
    /\|\s*Official\s*(Music\s*)?Video/gi,
    /\(Lyrics\)/gi,
    /\[Lyrics\]/gi,
    /-\s*Lyrics/gi,
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

  finalResults = finalResults.map((r) => ({
    ...r,
    title: cleanTitle(r.title),
  }));

  if (!queryContainsFilter && finalResults.length > 0) {
    const filtered = finalResults.filter((r) => !containsFilter(r.title));
    if (filtered.length > 0) finalResults = filtered;
  }

  setCacheResults(query, finalResults);

  if (interaction.client.clearTempStatus) interaction.client.clearTempStatus();
  await displaySearchResults(
    interaction,
    query,
    finalResults,
    typeSelection,
    {
      ARROW,
      FIRE,
      SEARCH,
      DOTS,
      PING_RED,
    },
    refinedQuery,
  );
};

async function displaySearchResults(
  interaction,
  query,
  finalResults,
  typeSelection,
  EMOJIS,
  refinedQuery,
) {
  const { ARROW, FIRE, SEARCH, DOTS, PING_RED } = EMOJIS;

  if (finalResults.length === 0) {
    return interaction.editReply({
      content: `### ${PING_RED} **No results found** for **${refinedQuery}** on **${typeSelection.toUpperCase()}**.`,
      embeds: [],
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`search_select_${typeSelection}`)
    .setPlaceholder(`Choose a result...`)
    .addOptions(
      finalResults.slice(0, 25).map((res, index) => {
        const url = res.webpage_url || res.url;
        const resultId = `res_${Math.random().toString(36).substring(7)}_${index}`;
        searchCache.set(resultId, {
          url,
          title: res.title,
          uploader: res.uploader,
        });
        if (searchCache.size > 100) {
          const firstKey = searchCache.keys().next().value;
          searchCache.delete(firstKey);
        }
        const cleanUploader = (res.uploader || "Unknown")
          .replace(/\n/g, " ")
          .replace(/\s\s+/g, " ")
          .trim();

        return {
          label: `${index + 1}. ${res.title.substring(0, 90)}`,
          description: `By: ${cleanUploader}`.substring(0, 100),
          value: resultId,
        };
      }),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const content = `### ${FIRE} Found **${finalResults.length}** results for **${refinedQuery}** on **${typeSelection.toUpperCase()}**. Select one below:`;

  await interaction.editReply({
    content: content,
    embeds: [],
    components: [row],
  });

  if (interaction.client.clearTempStatus) interaction.client.clearTempStatus();

  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 300000);
}
module.exports.searchCache = searchCache;
