const axios = require("axios");
const cheerio = require("cheerio");

async function findLyrics(query) {
  try {
    const searchUrl = `https://genius.com/api/search?q=${encodeURIComponent(query)}`;
    console.log(`[LYRICS] Searching Genius API: ${searchUrl}`);

    const { data: searchRes } = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });

    const hits = searchRes.response.hits;
    if (!hits || hits.length === 0) return "*Lyrics not found.*";

    const geniusUrl = hits[0].result.url;
    console.log(`[LYRICS] Fetching lyrics from: ${geniusUrl}`);
    const { data: lyricsPage } = await axios.get(geniusUrl);
    const $$ = cheerio.load(lyricsPage);

    let lyrics = "";
    $$("[class^='Lyrics__Container'], .lyrics").each((i, el) => {
      const chunk = $$(el)
        .html()
        .replace(/<br>/g, "\n")
        .replace(/<[^>]*>/g, "");
      lyrics += chunk + "\n";
    });

    let cleanedLyrics = lyrics
      .trim()
      .replace(/^\d+\s*Contributors/i, "")
      .replace(/^[^\n]*Lyrics/i, "")
      .trim();

    return cleanedLyrics || "*Lyrics found but format not supported.*";
  } catch (e) {
    console.error("[LYRICS] Error:", e.message);
    return "*Error fetching lyrics.*";
  }
}

module.exports = { findLyrics };
