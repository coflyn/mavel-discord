const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");

async function runKomikuFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const MANGA = getEmoji("camera", "🎌");
  const LEA = getEmoji("check", "✅");
  const NOTIF = getEmoji("notif", "🔔");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Reading Komiku",
      "Opening browser...",
    );
  }

  let normalizedUrl = url.split("#")[0];
  if (url.includes("komiku.id"))
    normalizedUrl = normalizedUrl.replace("komiku.id", "komiku.com");

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Komiku Downloader",
          "Loading chapter and rendering panels...",
        ),
      ],
    });

    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page
      .waitForSelector("#Baca_Komik", { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 300;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });

    const docTitle =
      (await page.title()).split(" - ")[0].trim() || "Manga Chapter";

    const imageUrls = await page.evaluate(() => {
      const container =
        document.querySelector("#Baca_Komik") ||
        document.querySelector(".isi") ||
        document.body;
      const imgs = container.querySelectorAll("img");
      return Array.from(imgs)
        .map((img) => img.getAttribute("data-src") || img.getAttribute("src"))
        .filter((src) => src && src.startsWith("http"));
    });

    if (imageUrls.length === 0)
      throw new Error("No manga panels found in this chapter.");

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const jobId = Math.random().toString(36).substring(2, 10);
    const localPaths = [];

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Downloading Panels",
          `Fetching ${imageUrls.length} images...`,
        ),
      ],
    });

    for (let i = 0; i < imageUrls.length; i++) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Downloading Panels",
            `Panel ${i + 1} of ${imageUrls.length} captured...`,
          ),
        ],
      });

      const imgUrl = imageUrls[i];
      const ext = imgUrl.split(".").pop().split("?")[0] || "jpg";
      const imgPath = path.join(tempDir, `km_${jobId}_${i + 1}.${ext}`);

      try {
        const res = await axios.get(imgUrl, {
          responseType: "arraybuffer",
          headers: { Referer: "https://komiku.com/" },
        });
        fs.writeFileSync(imgPath, res.data);
        localPaths.push(imgPath);
      } catch (e) {
        console.warn(`[KOMIKU-IMG-FAIL] Index ${i}:`, e.message);
      }
    }

    await browser.close();

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: localPaths.length, type: "Manga PDF" },
      thumbnail: "https://komiku.com/favicon.ico",
      platform: "Komiku",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: localPaths,
    };
    saveDB(db);

    const foundEmbed = new EmbedBuilder()
      .setColor("#2ed573")
      .setTitle(`${MANGA} **Komiku Chapter Ready**`)
      .setDescription(
        `### ${LEA} **Processing Complete**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Pages:** *${localPaths.length} Panels*\n` +
          `${ARROW} **Link:** [Original Link](<${url}>)\n\n` +
          `*Compiling manga into PDF...*`,
      );

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[KOMIKU-JS] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runKomikuFlow };

module.exports = { runKomikuFlow };
