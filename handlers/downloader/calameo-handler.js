const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { bundleImagesToPdf } = require("../../utils/filetools");

async function runCalameoFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const MAG = getEmoji("camera", "📕");
  const LEA = getEmoji("ping_green", "✅");
  const NOTIF = getEmoji("notif", "🔔");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Searching...",
      "Finding the publication...",
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1800 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();

    await _editResponse({
      embeds: [
        getStatusEmbed(guild, "Searching...", "Opening the publication..."),
      ],
    });

    const bkcodeMatch =
      url.match(
        /(?:read|books|calameo\.com\/[^\/]+\/)\/?([a-zA-Z0-9]{15,})/i,
      ) || url.match(/[0-9a-f]{21,}/i);
    const bkcode = bkcodeMatch ? bkcodeMatch[0].split("/").pop() : null;
    const readUrl = bkcode ? `https://www.calameo.com/read/${bkcode}` : url;

    await page.goto(readUrl, { waitUntil: "load", timeout: 60000 });

    try {
      const readBtn = page.locator(
        'button:has-text("Read the publication"), .read-button',
      );
      if ((await readBtn.count()) > 0) {
        await readBtn.first().click({ force: true });
        await page.waitForTimeout(2000);
      }
    } catch (e) {}

    await page.waitForSelector(".page", { timeout: 15000 }).catch(() => {
      console.warn("[CALAMEO-WARN] .page selector timeout");
    });

    await page.addStyleTag({
      content: `
        .toolbar, .overlay, .zoom-controls, .navigation-arrows, 
        .calameo-logo, .bottom-bar, .side-panels, .header-bar,
        iframe[src*='facebook'], iframe[src*='google'], .cookie-banner {
          display: none !important;
        }
        body, html { background: white !important; }
      `,
    });

    const docTitle =
      (await page.title()).replace(" | Calaméo", "").trim() ||
      "Calaméo Publication";

    const pages = page.locator(".page");
    const pageCount = await pages.count();

    if (pageCount === 0)
      throw new Error(
        "Could not detect publication pages. Try again or check the link.",
      );

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const jobId = Math.random().toString(36).substring(2, 10);
    const imageUrls = [];

    await _editResponse({
      embeds: [getStatusEmbed(guild, "Working...", `HQ Processing...`)],
    });

    for (let i = 0; i < pageCount; i++) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Working...",
            `Reading page ${i + 1} of ${pageCount}...`,
          ),
        ],
      });

      const pageElement = pages.nth(i);
      await pageElement.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);

      const screenshotPath = path.join(tempDir, `clm_${jobId}_${i + 1}.png`);
      await pageElement.screenshot({ path: screenshotPath });
      imageUrls.push(screenshotPath);

      if (i > 150) break;
    }

    await browser.close();

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: imageUrls.length, type: "Digital Publication" },
      thumbnail: "https://www.calameo.com/favicon.ico",
      platform: "Calaméo",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: imageUrls,
    };
    saveDB(db);

    const foundEmbed = new EmbedBuilder()
      .setColor("#ff4757")
      .setTitle(`${MAG} **Calaméo Ready**`)
      .setDescription(
        `### ${LEA} **Processing Complete**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Platform:** *CALAMEO*\n\n` +
          `*Bundling Ultra-HD pages into PDF...*`,
      );

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[CALAMEO-JS] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runCalameoFlow };

module.exports = { runCalameoFlow };
