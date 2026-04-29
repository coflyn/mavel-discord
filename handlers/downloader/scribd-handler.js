const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");

async function runScribdFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const ARCHIVE = getEmoji("camera", "📷");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
    await _editResponse({
      embeds: [
        getStatusEmbed(guild, "Searching...", "Finding the document..."),
      ],
    }).catch(() => {});
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Searching...",
      "Finding the document...",
    );
  }

  let browser;
  try {
    const docIdMatch = url.match(/document\/(\d+)/);
    if (!docIdMatch) throw new Error("Could not extract a valid Document ID.");
    const documentId = docIdMatch[1];
    const embedUrl = `https://www.scribd.com/embeds/${documentId}/content?start_page=1&view_mode=scroll`;

    const { getChromiumResolverRules } = require("../../utils/dns-bypass");
    const resolverRules = await getChromiumResolverRules(url);

    browser = await chromium.launch({
      headless: true,
      args: resolverRules,
    });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 2000 },
      deviceScaleFactor: 2,
    });

    await context.route("**/*osano*/**", (route) => route.abort());
    await context.route("**/*consent*/**", (route) => route.abort());
    await context.route("**/*analytics*/**", (route) => route.abort());
    await context.route("**/*googletagmanager*/**", (route) => route.abort());

    await context.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `
        .osano-cm-window, .osano-cm-dialog, .osano-cm-window__dialog,
        #osano-cm-window, #osano-cm-dialog,
        .toolbar_bottom, .scribd_logo, #cookie-banner,
        .global_header, .banner_wrapper { 
          display: none !important; 
        }
      `;
      document.documentElement.appendChild(style);
    });

    const page = await context.newPage();
    await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 60000 });

    await editResponse({
      embeds: [
        getStatusEmbed("Getting File Info...", "Getting document info..."),
      ],
    });

    await _editResponse({
      embeds: [
        getStatusEmbed(guild, "Searching...", "Getting document info..."),
      ],
    });

    try {
      await page.waitForSelector(".outer_page", { timeout: 15000 });
    } catch (e) {
      console.warn("[SCRIBD] .outer_page not found, trying fallback...");
    }

    const urlSlugMatch = url.match(/document\/\d+\/([^\/\?]+)/);
    const urlSlug = urlSlugMatch
      ? urlSlugMatch[1].replace(/-/g, " ").trim()
      : null;

    let docTitle =
      urlSlug ||
      (await page
        .title()
        .then((t) =>
          t.replace(" | Scribd", "").replace("Document", "").trim(),
        ));
    if (!docTitle || docTitle.toLowerCase() === "scribd")
      docTitle = "Scribd Document";

    const pages = page.locator(".outer_page");
    const pageCount = await pages.count();

    if (pageCount === 0)
      throw new Error("We couldn't find any pages in this document.");

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const imageUrls = [];
    const jobId = Math.random().toString(36).substring(2, 10);

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Working...",
          `Loading ${pageCount} pages, please wait...`,
        ),
      ],
    });

    for (let i = 0; i < pageCount; i++) {
      const pageElement = pages.nth(i);

      await pageElement.scrollIntoViewIfNeeded();

      await page.waitForTimeout(3000);

      try {
        await page.waitForFunction(
          (idx) => {
            const p = document.querySelectorAll(".outer_page")[idx];
            if (!p) return false;
            const img = p.querySelector("img");
            return img && img.complete && img.naturalWidth > 0;
          },
          i,
          { timeout: 10000 },
        );
      } catch (e) {
        console.warn(
          `[SCRIBD-WAIT] Page ${i + 1} might not be fully loaded. Capturing anyway.`,
        );
      }

      const screenshotPath = path.join(
        tempDir,
        `scribd_hd_${jobId}_${i + 1}.png`,
      );
      await pageElement.screenshot({ path: screenshotPath });

      imageUrls.push(screenshotPath);
    }

    await browser.close();

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { pages: pageCount, type: "High Quality PDF" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.scribd.com/favicon.ico",
      platform: "Scribd",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: imageUrls,
    };
    saveDB(db);

    const LEA = getEmoji("check", "✅");
    const NOTIF = getEmoji("notif", "🔔");
    const foundEmbed = new EmbedBuilder()
      .setColor("#636e72")
      .setTitle(`${ARCHIVE} **Scribd Document Found**`)
      .setDescription(
        `### ${LEA} **File Ready**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Total Pages:** *${pageCount}*\n` +
          `${ARROW} **Quality:** *Ultra-HD (2.0x Scaled)*\n\n` +
          `*Creating your PDF with high quality...*`,
      );

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[SCRIBD-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Download Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runScribdFlow };
