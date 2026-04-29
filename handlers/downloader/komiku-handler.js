const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

async function runKomikuFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  const MANGA = ctx.getEmoji("camera", "🎌");
  const LEA = ctx.getEmoji("check", "✅");

  await ctx.init("Reading Komiku", "Opening browser...");

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

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
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

    const { generateJobId } = require("./core-helpers");
const colors = require("../../utils/embed-colors");
    const jobId = generateJobId();
    const localPaths = [];

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Downloading Panels",
          `Fetching ${imageUrls.length} images...`,
        ),
      ],
    });

    for (let i = 0; i < imageUrls.length; i++) {
      await ctx.editResponse({
        embeds: [
          ctx.statusEmbed(
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

    createJob(target, {
      jobId,
      url,
      title: docTitle,
      stats: { pages: localPaths.length, type: "Manga PDF" },
      thumbnail: "https://komiku.com/favicon.ico",
      platform: "Komiku",
      isGallery: true,
      imageUrls: localPaths,
    });

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.DOCUMENT)
      .setTitle(`${MANGA} **Komiku Chapter Ready**`)
      .setDescription(
        `### ${LEA} **Processing Complete**\n` +
          `${ctx.ARROW} **Title:** *${docTitle}*\n` +
          `${ctx.ARROW} **Pages:** *${localPaths.length} Panels*\n` +
          `${ctx.ARROW} **Link:** [Original Link](<${url}>)\n\n` +
          `*Compiling manga into PDF...*`,
      );

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[KOMIKU-JS] Error:", e.message);
    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runKomikuFlow };
