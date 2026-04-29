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

async function runAcademiaFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const BOOK = getEmoji("camera", "📖");
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
      "Searching...",
      "Finding the document...",
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await _editResponse({
      embeds: [
        getStatusEmbed(guild, "Searching...", "Checking the link and pages..."),
      ],
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.addStyleTag({
      content: `
        div[class*='modal'], div[class*='upsell'], div[class*='auth'], 
        div[class*='overlay'], div[class*='backdrop'], div[class*='mask'],
        [class*='work-cover'], [class*='upsell-banner'], [class*='bottom-banner'], 
        #react-modal, .ds-signup-banner, .ds-work-card--button-container, 
        .header--container, .outline--container, .safe-below-fold--related-works,
        .share-and-save-buttons, .outline--wrapper,
        .core-metadata-header, #CORE_HEADER, [id*='CORE'],
        [class*='viewer-controls'], [class*='floating'], [class*='sticky'],
        [id*='controls'], .ds-viewer-controls, .ds-document-viewer-controls,
        header, footer, nav, aside, .js-main-nav, [class*='fb_'], dialog { 
            display: none !important; 
            visibility: hidden !important;
            opacity: 0 !important;
        }
        .outer_page, .ds-work-page, [id*='outer_page'] { 
            margin: 0 auto 15px auto !important; 
            box-shadow: none !important; 
        }
      `,
    });

    try {
      const gate = page.locator(
        '.js-tc-loswp--continue-reading-button--work-card, button:has-text("See full PDF")',
      );
      if ((await gate.count()) > 0) {
        await gate.first().click({ force: true });
        await page.waitForTimeout(2000);
      }
    } catch (e) {}

    const docTitle =
      (await page.title()).split(" - Academia.edu")[0].trim() ||
      "Academia Document";
    const pages = page.locator(
      ".outer_page, .ds-work-page, [id*='outer_page']",
    );
    const pageCount = await pages.count();

    if (pageCount === 0) throw new Error("No pages detected on this document.");

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const jobId = Math.random().toString(36).substring(2, 10);
    const imageUrls = [];

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Downloading Document",
          `Capturing ${pageCount} pages...`,
        ),
      ],
    });

    for (let i = 0; i < pageCount; i++) {
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
            "Downloading Document",
            `Capturing page ${i + 1} of ${pageCount}...`,
          ),
        ],
      });

      const pageElement = pages.nth(i);
      await pageElement.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);

      const screenshotPath = path.join(tempDir, `ac_${jobId}_${i + 1}.png`);
      await pageElement.screenshot({ path: screenshotPath });
      imageUrls.push(screenshotPath);
    }

    await browser.close();

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: pageCount, type: "Academic PDF" },
      thumbnail: "https://www.academia.edu/favicon.ico",
      platform: "Academia",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: imageUrls,
    };
    saveDB(db);

    const foundEmbed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${BOOK} **Academia Document Ready**`)
      .setDescription(
        `### ${LEA} **Finished!**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Pages:** *${pageCount}*\n\n` +
          `*Making your PDF file now...*`,
      );

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[ACADEMIA-JS] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runAcademiaFlow };

module.exports = { runAcademiaFlow };
