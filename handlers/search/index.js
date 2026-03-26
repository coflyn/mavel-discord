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
const cheerio = require("cheerio");
const searchCache = new Map();

module.exports = async function searchHandler(interaction) {
  const query = interaction.options.getString("query");
  const typeSelection = interaction.options.getString("type") || "ytm";

  if (interaction.deferReply) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
  }

  if (!query) {
    const guildEmojis = await interaction.guild.emojis.fetch();
    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "🔥");
    const SEARCH = getEmoji("amogus", "🔎");
    const DOTS = getEmoji("three_dots", "🎵");
    const PING_RED = getEmoji("ping_red", "🔴");

    const botUser = await interaction.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setAuthor({
        name: "MaveL Search Engine",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${SEARCH} **Integrated Pulse Search**`)
      .setImage(botBanner)
      .setDescription(
        `*Multi-platform indexing system for direct media retrieval.*`,
      )
      .addFields(
        {
          name: `${FIRE} **Visuals**`,
          value: `${ARROW} *YouTube (Video Download)*`,
          inline: false,
        },
        {
          name: `${DOTS} **Acoustics**`,
          value:
            `${ARROW} *YouTube Music (Audio Download)*\n` +
            `${ARROW} *Spotify (Metadata Extraction)*\n` +
            `${ARROW} *Bandcamp (Original Metadata)*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL | Select Option Above",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await (interaction.deferred ? interaction.editReply({
      embeds: [embed],
    }) : interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    }));

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);

    return;
  }


  let refinedQuery = query;

  let finalResults = [];

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
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q + " site:bandcamp.com")}`;
      try {
        const { data } = await axios.get(searchUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        const $ = cheerio.load(data);
        $(".result__a").each((i, el) => {
          let href = $(el).attr("href");
          if (href && href.includes("uddg=")) {
            try {
              const urlParams = new URL(href, "https://duckduckgo.com").searchParams;
              const uddg = urlParams.get("uddg");
              if (uddg) href = decodeURIComponent(uddg);
            } catch (e) {}
          }
          
          if (
            href &&
            (href.includes(".bandcamp.com/track/") ||
              href.includes(".bandcamp.com/album/"))
          ) {
            const isAlbum = href.includes(".bandcamp.com/album/");
            const urlParts = new URL(href);
            const artistName = urlParts.hostname.split(".")[0];
            const titleSlug = urlParts.pathname
              .split("/")
              .pop()
              .replace(/-/g, " ");

            let title = titleSlug.charAt(0).toUpperCase() + titleSlug.slice(1);
            if (isAlbum) title = `[Album] ${title}`;

            const isHighConfidence = q && (title.toLowerCase().includes(q.toLowerCase().split(" ")[0]) || titleSlug.includes(q.toLowerCase().split(" ")[0]));

            if (title && !res.some((r) => r.webpage_url === href)) {
              if (!isAlbum && isHighConfidence) {
                 res.unshift({
                   title: title,
                   webpage_url: href,
                   uploader: artistName.charAt(0).toUpperCase() + artistName.slice(1),
                 });
              } else {
                 res.push({
                   title: title,
                   webpage_url: href,
                   uploader: artistName.charAt(0).toUpperCase() + artistName.slice(1),
                 });
              }
            }
          }
        });
      } catch (e) {}
      return res.slice(0, 20);
    };
    finalResults = await tryBcSearch(refinedQuery);
  } else if (typeSelection === "spot") {
    const trySpotSearch = async (q) => {
      const res = [];
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q + " site:open.spotify.com/track")}`;
      try {
        const { data } = await axios.get(searchUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = cheerio.load(data);
        $(".result__a").each((i, el) => {
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
        });
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

  const filterWords = ["remix", "cover", "fanmade", "mashup", "reverb"];
  const containsFilter = (txt) =>
    filterWords.some((w) => txt.toLowerCase().includes(w));
  const queryContainsFilter = filterWords.some((w) =>
    query.toLowerCase().includes(w),
  );

  if (!queryContainsFilter && finalResults.length > 0) {
    const filtered = finalResults.filter((r) => !containsFilter(r.title));
    if (filtered.length > 0) finalResults = filtered;
  }

  if (finalResults.length === 0) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6c5ce7")
          .setDescription(
            `### ${PING_RED} **No results found**\n*No matches found on ${typeSelection.toUpperCase()}*`,
          ),
      ],
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`search_select_${typeSelection}`)
    .setPlaceholder(`Choose a result...`)
    .addOptions(
      finalResults.slice(0, 10).map((res, index) => {
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
        return {
          label: `${index + 1}. ${res.title.substring(0, 90)}`,
          description: `By: ${(res.uploader || "Unknown").substring(0, 50)}`,
          value: resultId,
        };
      }),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const AMOGUS =
    (await interaction.guild.emojis.fetch())
      .find((e) => e.name === "amogus")
      ?.toString() || "🔎";

  const resultEmbed = new EmbedBuilder()
    .setColor("#6c5ce7")
    .setDescription(
      `### ${AMOGUS} **Search Synchronized**\n` +
        `*Refined Query:* \`${refinedQuery}\`\n` +
        `*Target:* \`${typeSelection.toUpperCase()}\``,
    )
    .setFooter({ text: "Select a resource from the menu below to proceed" });

  await interaction.editReply({
    embeds: [resultEmbed],
    components: [row],
  });

  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 300000);
};
module.exports.searchCache = searchCache;
