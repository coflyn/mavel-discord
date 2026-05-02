const { getPage } = require("../../utils/browser");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");
const colors = require("../../utils/embed-colors");

async function runScribdFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  const ARCHIVE = ctx.getEmoji("camera", "📷");
  await ctx.init("Searching...", "Finding the document...", { silent: true });

  let page;
  try {
    const docIdMatch = url.match(/document\/(\d+)/);
    if (!docIdMatch) throw new Error("Could not extract a valid Document ID.");
    const documentId = docIdMatch[1];
    const embedUrl = `https://www.scribd.com/embeds/${documentId}/content?start_page=1&view_mode=scroll`;

    const { getChromiumResolverRules } = require("../../utils/dns-bypass");
    const resolverRules = await getChromiumResolverRules(url);

    page = await getPage({
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
    await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 60000 });


    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed("Searching...", "Getting document info..."),
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

    const tempDir = getTempDir();

    const imageUrls = [];
    const { generateJobId } = require("./core-helpers");
const { getTempDir } = require("../../utils/filetools");
    const jobId = generateJobId();

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
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

    if (page) await page.close();

    createJob(target, {
      jobId,
      url,
      title: docTitle,
      stats: { pages: pageCount, type: "High Quality PDF" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.scribd.com/favicon.ico",
      platform: "Scribd",
      isGallery: true,
      hasVideo: false,
      isVideo: false,
      extractor: "scribd",
      imageUrls: imageUrls,
    });

    const LEA = ctx.getEmoji("check", "✅");
    const NOTIF = ctx.getEmoji("notif", "🔔");
    const foundEmbed = new EmbedBuilder()
      .setColor(colors.DOCUMENT)
      .setTitle(`${ARCHIVE} **Scribd Document Found**`)
      .setDescription(
        `### ${LEA} **File Ready**\n` +
          `${ctx.ARROW} **Title:** *${docTitle}*\n` +
          `${ctx.ARROW} **Total Pages:** *${pageCount}*\n` +
          `${ctx.ARROW} **Quality:** *Ultra-HD (2.0x Scaled)*\n\n` +
          `*Creating your PDF with high quality...*`,
      );

    return await ctx.finalize(jobId, null, foundEmbed, {...options});
  } catch (e) {
    if (page) await page.close();
    console.error("[SCRIBD-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Download Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runScribdFlow };
