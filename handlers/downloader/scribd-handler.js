const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { loadDB, saveDB } = require("./core-helpers");

async function runScribdFlow(target, url, options = {}) {
  let statusMsg = options.statusMsg;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const guildEmojis = guild
    ? await guild.emojis.fetch().catch(() => null)
    : null;
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const ARCHIVE = getEmoji("camera", "📷");
  const LOADING = getEmoji("loading_pulse", "⚙️");

  const getStatusEmbed = (status, details) => {
    return new EmbedBuilder()
      .setColor("#6c5ce7")
      .setDescription(
        `### ${ARCHIVE} **${status}**\n${ARROW} **Details:** *${details}*`,
      );
  };

  const initialEmbed = getStatusEmbed(
    "Archival Request Initiated",
    "Launching HD Browser Engine...",
  );

  if (!statusMsg) {
    if (target.replied || target.deferred) {
      statusMsg = await target.editReply({
        embeds: [initialEmbed],
        withResponse: true,
      });
    } else {
      statusMsg = target.reply
        ? await target.reply({ embeds: [initialEmbed], withResponse: true })
        : await target.channel.send({ embeds: [initialEmbed] });
    }
  } else {
    const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
    await msg.edit({ embeds: [initialEmbed] }).catch(() => {});
  }

  const editResponse = async (data) => {
    try {
      const payload = typeof data === "string" ? { content: data } : data;
      if (target.editReply) return await target.editReply(payload);
      const msg = statusMsg.resource ? statusMsg.resource.message : statusMsg;
      return await msg.edit(payload);
    } catch (e) {
      console.error("[SCRIBD-EDIT] Error:", e.message);
    }
  };

  let browser;
  try {
    const docIdMatch = url.match(/document\/(\d+)/);
    if (!docIdMatch) throw new Error("Could not extract a valid Document ID.");
    const documentId = docIdMatch[1];
    const embedUrl = `https://www.scribd.com/embeds/${documentId}/content?start_page=1&view_mode=scroll`;

    browser = await chromium.launch({ headless: true });
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

    await editResponse({
      embeds: [
        getStatusEmbed(
          "Intercepting Signal",
          "Decrypting Document Metadata...",
        ),
      ],
    });

    await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 60000 });

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
      throw new Error(
        "No pages detected in browser view (Selector: .outer_page).",
      );

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const imageUrls = [];
    const jobId = Math.random().toString(36).substring(2, 10);

    await editResponse({
      embeds: [
        getStatusEmbed(
          "Archival in Progress",
          `Capturing ${pageCount} High-Fidelity Pages...`,
        ),
      ],
    });

    for (let i = 0; i < pageCount; i++) {
      const pageElement = pages.nth(i);

      await pageElement.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);

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
      stats: { pages: pageCount, type: "HD PDF Archival" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.scribd.com/favicon.ico",
      platform: "Scribd",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: imageUrls,
    };
    saveDB(db);

    const LEA = getEmoji("lea", "✅");
    const foundEmbed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${ARCHIVE} **Scribd Document Intercepted**`)
      .setDescription(
        `### ${LEA} **HD Archival Ready**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Pages Detected:** *${pageCount}*\n` +
          `${ARROW} **Quality:** *Ultra-HD (2.0x Scaled)*\n\n` +
          `*Finalizing PDF reconstruction via high-fidelity pipeline...*`,
      );

    const resMsg = await editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[SCRIBD-FLOW] Error:", e.message);
    await editResponse({
      embeds: [getStatusEmbed("Archival Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runScribdFlow };
