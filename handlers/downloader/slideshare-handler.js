const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { getStatusEmbed, editResponse, sendInitialStatus } = require("../../utils/response-helper");

async function runSlideshareFlow(target, url, options = {}) {
  let browser;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const ARCHIVE = getEmoji("camera", "📷");

  let statusMsg;
  const _editResponse = async (data) => await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Reading SlideShare", "Getting info...")],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(target, "Reading SlideShare", "Getting info...");
  }

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const urlSlugMatch = url.match(/slideshare\.net\/[^\/]+\/([^\/\?]+)/);
    const urlSlug = urlSlugMatch
      ? urlSlugMatch[1].replace(/-/g, " ").trim()
      : null;
    let docTitle =
      urlSlug ||
      (await page.title().then((t) => t.replace(" | SlideShare", "").trim()));
    if (!docTitle || docTitle.toLowerCase() === "slideshare")
      docTitle = "SlideShare Presentation";

    await page.evaluate(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const iterations = 10;
      for (let i = 0; i < iterations; i++) {
        window.scrollTo(0, (document.body.scrollHeight / iterations) * (i + 1));
        await delay(1000);
      }
    });

    const imageUrlsRaw = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll(
          'img[class*="VerticalSlideImage"], img[data-full], .slide-image',
        ),
      );
      return imgs.map(
        (img) =>
          img.getAttribute("data-full") ||
          img.getAttribute("data-normal") ||
          img.getAttribute("src"),
      );
    });

    await browser.close();

    const filteredUrls = imageUrlsRaw
      .filter((u) => u && u.startsWith("http"))
      .map((u) => {
        return u.replace(/-\d+\.jpg/, "-2048.jpg").split("?")[0];
      });

    if (filteredUrls.length === 0) {
      throw new Error("Could not extract slide assets.");
    }

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const localPaths = [];
    const jobId = Math.random().toString(36).substring(2, 10);

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Download Active",
          `Downloading ${filteredUrls.length} HD Slides (with Retry Safety)...`,
        ),
      ],
    });

    for (let i = 0; i < filteredUrls.length; i++) {
      const assetUrl = filteredUrls[i];
      const localPath = path.join(
        tempDir,
        `slideshare_hd_${jobId}_${i + 1}.jpg`,
      );

      let success = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 3;

      while (!success && attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const res = await axios.get(assetUrl, {
            responseType: "arraybuffer",
            timeout: 15000,
          });
          fs.writeFileSync(localPath, res.data);
          localPaths.push(localPath);
          success = true;
        } catch (e) {
          if (attempts >= MAX_ATTEMPTS) {
            try {
              const fallbackUrl = assetUrl.replace("-2048.jpg", "-1024.jpg");
              const res = await axios.get(fallbackUrl, {
                responseType: "arraybuffer",
                timeout: 15000,
              });
              fs.writeFileSync(localPath, res.data);
              localPaths.push(localPath);
              success = true;
            } catch (err) {
              console.error(
                `[SLIDESHARE-DL] Failed slide ${i + 1} after ${attempts} tries: ${e.message}`,
              );
            }
          } else {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
    }

    const db = loadDB();
    db.jobs[jobId] = {
      url: url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: localPaths.length, type: "Slide Download" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.slideshare.net/favicon.ico",
      platform: "SlideShare",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: localPaths,
    };
    saveDB(db);

    return { jobId, statusMsg };
  } catch (e) {
    if (browser) await browser.close();
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Download Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runSlideshareFlow };
