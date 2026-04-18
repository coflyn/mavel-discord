const cloudscraper = require("cloudscraper");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { loadDB, saveDB } = require("./core-helpers");

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function runDSrvFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Opening website...",
      "Checking the link...",
    );
  }

  try {
    let chapterUrl = url.trim();

    if (chapterUrl.includes("/manga/") || chapterUrl.includes("/doujin/")) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Analyzing Landing Page...",
            "Finding the latest chapter...",
          ),
        ],
      });

      const landingHtml = await cloudscraper.get(chapterUrl);
      const $landing = cheerio.load(landingHtml);
      let foundChapter = null;

      $landing("a").each((i, el) => {
        const href = $landing(el).attr("href");
        if (
          href &&
          (href.includes("/chapter/") ||
            (!href.includes("/manga/") &&
              !href.includes("/doujin/") &&
              href.length > 5)) &&
          !foundChapter &&
          href !== chapterUrl
        ) {
          if (href.startsWith("http") || href.startsWith("/")) {
            foundChapter = href;
          }
        }
      });

      if (!foundChapter)
        throw new Error("Could not find a valid chapter on this landing page.");
      chapterUrl = foundChapter.startsWith("http")
        ? foundChapter
        : "https://doujindesu.tv" + foundChapter;
    }

    const body = await cloudscraper.get(chapterUrl);
    const $ = cheerio.load(body);

    const match = body.match(/load_data\((\d+)\)/);
    if (!match)
      throw new Error(
        "This doesn't seem to be a viewer page. Please provide a direct chapter link.",
      );
    const chapterId = match[1];

    await _editResponse({
      embeds: [getStatusEmbed(guild, "Found it!", "Fetching image signals...")],
    });

    const ajaxHtml = await cloudscraper.post({
      uri: "https://doujindesu.tv/themes/ajax/ch.php",
      headers: {
        Referer: chapterUrl,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...COMMON_HEADERS,
      },
      body: `id=${chapterId}`,
    });

    const $img = cheerio.load(ajaxHtml);
    const imageUrls = [];
    $img("img").each((i, el) => {
      const src = $img(el).attr("src") || $img(el).attr("data-src");
      if (src && !imageUrls.includes(src)) imageUrls.push(src);
    });

    if (imageUrls.length === 0)
      throw new Error("No images found on this page.");

    const docTitle =
      $("title").text().replace(" - Doujindesu", "").trim() ||
      `Chapter_${chapterId}`;
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const localPaths = [];
    const total = imageUrls.length;

    // DOWNLOAD LOCALLY (Like Lyn's logic) to bypass 403 Forbidden
    for (let i = 0; i < total; i++) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Working...",
            `Securing image ${i + 1} of ${total}...`,
          ),
        ],
      });

      const imgUrl = imageUrls[i];
      const localPath = path.join(tempDir, `dsrv_${chapterId}_${i + 1}.webp`);

      try {
        const imgBuffer = await cloudscraper.get({
          uri: imgUrl,
          encoding: null,
          headers: { ...COMMON_HEADERS, Referer: "https://doujindesu.tv/" },
        });
        fs.writeFileSync(localPath, imgBuffer);
        localPaths.push(localPath);
      } catch (err) {
        console.error(`[DSRV-DL] Failed page ${i + 1}:`, err.message);
      }
    }

    if (localPaths.length === 0)
      throw new Error(
        "Failed to secure any images. The server is strictly blocking us.",
      );

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url: chapterUrl,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: localPaths.length, type: "Archived Sync" },
      thumbnail: localPaths[0],
      platform: "DoujinDesu",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: localPaths, // Passing local file paths instead of remote URLs
    };
    saveDB(db);

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Success!",
          `${docTitle}\n${ARROW} Total: **${localPaths.length}** images secured. Ready to download.`,
        ),
      ],
    });

    return { jobId, statusMsg };
  } catch (e) {
    console.error("[DSRV-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed to Load", e.message)],
    });
    return null;
  }
}

module.exports = { runDSrvFlow };
