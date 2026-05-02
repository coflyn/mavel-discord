const { getPage } = require("../../utils/browser");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");
const { bundleImagesToPdf } = require("../../utils/filetools");
const colors = require("../../utils/embed-colors");

async function runCalameoFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  const MAG = ctx.getEmoji("camera", "📕");
  const LEA = ctx.getEmoji("check", "✅");
  const NOTIF = ctx.getEmoji("notif", "🔔");
  await ctx.init("Searching...", "Finding the publication...", { silent: true });

  let page;
  try {
    page = await getPage({
      viewport: { width: 1400, height: 1800 },
      deviceScaleFactor: 2,
    });

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed("Searching...", "Opening the publication..."),
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

    const tempDir = getTempDir();

    const { generateJobId } = require("./core-helpers");
const { getTempDir } = require("../../utils/filetools");
    const jobId = generateJobId();
    const imageUrls = [];

    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Working...", `HQ Processing...`)],
    });

    for (let i = 0; i < pageCount; i++) {
      await ctx.editResponse({
        embeds: [
          ctx.statusEmbed(
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

    if (page) await page.close();

    createJob(target, {
      jobId,
      url,
      title: docTitle,
      stats: { pages: imageUrls.length, type: "Digital Publication" },
      thumbnail: "https://www.calameo.com/favicon.ico",
      platform: "Calaméo",
      isGallery: true,
      imageUrls: imageUrls,
    });

    const foundEmbed = new EmbedBuilder()
      .setColor(colors.DOCUMENT)
      .setTitle(`${MAG} **Calaméo Ready**`)
      .setDescription(
        `### ${LEA} **Processing Complete**\n` +
          `${ctx.ARROW} **Title:** *${docTitle}*\n` +
          `${ctx.ARROW} **Platform:** *CALAMEO*\n\n` +
          `*Bundling Ultra-HD pages into PDF...*`,
      );

    return await ctx.finalize(jobId, null, foundEmbed, {...options});
  } catch (e) {
    if (page) await page.close();
    console.error("[CALAMEO-JS] Error:", e.message);
    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runCalameoFlow };
