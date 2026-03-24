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

module.exports = async function searchHandler(interaction) {
  const query = interaction.options.getString("query");
  const typeSelection = interaction.options.getString("type") || "ytm";

  if (!query) {
    const guildEmojis = await interaction.guild.emojis.fetch();
    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", ">");
    const FIRE = getEmoji("purple_fire", "🔥");
    const SEARCH = getEmoji("amogus", "🔎");
    const DOTS = getEmoji("three_dots", "🎵");

    const botUser = await interaction.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
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
            `${ARROW} *Bandcamp (Original Metadata)*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL | Select Option Above",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);

    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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
        console.log(`[SEARCH-META] Refined: ${refinedQuery}`);
      }
    }
  } catch (e) {
    console.error("[SEARCH-META] Refinement error:", e.message);
  }

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

            let title = titleSlug.charAt(0).toUpperCase() + titleSlug.slice(1);
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

    finalResults = await tryBcSearch(refinedQuery);
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
          .setColor("#1e4d2b")
          .setDescription(
            `### ❌ **No results found**\n> *No matches found on ${typeSelection.toUpperCase()}*`,
          ),
      ],
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`search_select_${typeSelection}`)
    .setPlaceholder(`Choose a result...`)
    .addOptions(
      finalResults.slice(0, 10).map((res, index) => ({
        label: `${index + 1}. ${res.title.substring(0, 90)}`,
        description: `By: ${(res.uploader || "Unknown").substring(0, 50)}`,
        value: res.webpage_url || res.url,
      })),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const AMOGUS =
    (await interaction.guild.emojis.fetch())
      .find((e) => e.name === "amogus")
      ?.toString() || "🔎";

  const resultEmbed = new EmbedBuilder()
    .setColor("#1e4d2b")
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
