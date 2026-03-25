const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { loadDB, saveDB } = require("./core-helpers");
const { EmbedBuilder } = require("discord.js");

async function runSlideshareFlow(target, url, options = {}) {
  let statusMsg = options.statusMsg || null;
  let browser;

  const editResponse = async (data) => {
    try {
      if (statusMsg && statusMsg.edit) {
        return await statusMsg.edit(data);
      }
      if (target.editReply) {
        return await target.editReply(data);
      }
    } catch (e) {}
  };

  const getEmoji = (name, fallback) => {
    const guild = target.guild || target.client?.guilds?.cache.first();
    return (
      guild?.emojis?.cache.find((e) => e.name === name)?.toString() || fallback
    );
  };

  const ARROW = getEmoji("arrow", "•");
  const ARCHIVE = getEmoji("camera", "📷");
  const LOADING = getEmoji("loading_pulse", "⚙️");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#1a472a")
      .setDescription(
        `### ${ARCHIVE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  await editResponse({
    embeds: [
      getStatusEmbed("Initiating Archival", "Scanning SlideShare Metadata..."),
    ],
  });

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
      for (let i = 0; i < 5; i++) {
        window.scrollTo(0, (document.body.scrollHeight / 5) * (i + 1));
        await delay(500);
      }
    });

    const imageUrlsRaw = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll('img[class*="VerticalSlideImage"]'),
      );
      return imgs.map(
        (img) =>
          img.getAttribute("src") ||
          img.getAttribute("data-full") ||
          img.getAttribute("data-normal"),
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

    await editResponse({
      embeds: [
        getStatusEmbed(
          "Asset Siphon Active",
          `Downloading ${filteredUrls.length} HD Slides...`,
        ),
      ],
    });

    for (let i = 0; i < filteredUrls.length; i++) {
      const assetUrl = filteredUrls[i];
      const localPath = path.join(
        tempDir,
        `slideshare_hd_${jobId}_${i + 1}.jpg`,
      );

      try {
        const res = await axios.get(assetUrl, {
          responseType: "arraybuffer",
          timeout: 10000,
        });
        fs.writeFileSync(localPath, res.data);
        localPaths.push(localPath);
      } catch (e) {
        try {
          const fallbackUrl = assetUrl.replace("-2048.jpg", "-1024.jpg");
          const res = await axios.get(fallbackUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });
          fs.writeFileSync(localPath, res.data);
          localPaths.push(localPath);
        } catch (err) {
          // Skip
        }
      }

      if ((i + 1) % 10 === 0) {
      }
    }

    const db = loadDB();
    db.jobs[jobId] = {
      url: url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: localPaths.length, type: "HD Slide Siphon" },
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
    await editResponse({
      content: `${LOADING} **Error:** *${e.message}*`,
      embeds: [],
    });
    return null;
  }
}

module.exports = { runSlideshareFlow };
