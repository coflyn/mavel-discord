const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { createJob, createHandlerContext } = require("./core-helpers");

async function runDPlayerFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  const DOC = ctx.getEmoji("camera", "📄");
  await ctx.init("Reading DocPlayer", "Opening browser...");

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    let capturedPdfUrl = null;
    let capturedHeaders = {};

    page.on("request", (request) => {
      const rUrl = request.url();
      if (rUrl.includes("storage") && rUrl.endsWith(".pdf")) {
        if (!capturedPdfUrl) {
          capturedPdfUrl = rUrl;
          capturedHeaders = request.headers();
        }
      }
    });

    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Searching...", "Finding the file...")],
    });

    await page.goto(url, { waitUntil: "load", timeout: 60000 });

    let timeoutCounter = 0;
    while (!capturedPdfUrl && timeoutCounter < 15) {
      timeoutCounter++;
      await ctx.editResponse({
        embeds: [
          ctx.statusEmbed(
            "Searching...",
            `Looking for the document (try ${timeoutCounter}/15)...`,
          ),
        ],
      });

      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1000);
    }

    if (!capturedPdfUrl)
      throw new Error("We couldn't find the source of this document.");

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Found it!",
          "Success! We found it. Downloading the file, please wait...",
        ),
      ],
    });

    const docTitle =
      (await page.title()).split(" - DocPlayer")[0].trim() ||
      "DocPlayer Document";

    const pdfResponse = await context.request.get(capturedPdfUrl, {
      headers: capturedHeaders,
    });
    const pdfBuffer = await pdfResponse.body();

    await browser.close();

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const { generateJobId } = require("./core-helpers");
const colors = require("../../utils/embed-colors");
    const jobId = generateJobId();
    const outputPath = path.join(tempDir, `dp_${jobId}.pdf`);
    fs.writeFileSync(outputPath, pdfBuffer);

    createJob(target, {
      jobId,
      url,
      title: docTitle,
      stats: { type: "Direct PDF" },
      thumbnail: "https://docplayer.net/favicon.ico",
      platform: "DocPlayer",
      isGallery: false,
      directUrl: outputPath,
    });

    const LEA = ctx.getEmoji("check", "✅");
    const foundEmbed = new EmbedBuilder()
      .setColor(colors.DOCUMENT)
      .setTitle(`${DOC} **DocPlayer Ready**`)
      .setDescription(
        `### ${LEA} **Source Captured**\n` +
          `${ctx.ARROW} **Title:** *${docTitle}*\n` +
          `${ctx.ARROW} **Platform:** *DOCPLAYER*\n\n` +
          `*Finalizing file and sending to chat...*`,
      );

    const resMsg = await ctx.editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[DOCPLAYER-JS] Error:", e.message);
    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runDPlayerFlow };
