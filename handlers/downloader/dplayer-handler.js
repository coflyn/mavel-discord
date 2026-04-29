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

async function runDPlayerFlow(target, url, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const DOC = getEmoji("camera", "📄");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Reading DocPlayer",
      "Opening browser...",
    );
  }

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

    await _editResponse({
      embeds: [getStatusEmbed(guild, "Searching...", "Finding the file...")],
    });

    await page.goto(url, { waitUntil: "load", timeout: 60000 });

    let timeoutCounter = 0;
    while (!capturedPdfUrl && timeoutCounter < 15) {
      timeoutCounter++;
      await _editResponse({
        embeds: [
          getStatusEmbed(
            guild,
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

    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
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

    const jobId = Math.random().toString(36).substring(2, 10);
    const outputPath = path.join(tempDir, `dp_${jobId}.pdf`);
    fs.writeFileSync(outputPath, pdfBuffer);

    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title: docTitle,
      stats: { type: "Direct PDF" },
      thumbnail: "https://docplayer.net/favicon.ico",
      platform: "DocPlayer",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: false,
      directUrl: outputPath,
    };
    saveDB(db);

    const foundEmbed = new EmbedBuilder()
      .setColor("#ffa502")
      .setTitle(`${DOC} **DocPlayer Ready**`)
      .setDescription(
        `### ${LEA} **Source Captured**\n` +
          `${ARROW} **Title:** *${docTitle}*\n` +
          `${ARROW} **Platform:** *DOCPLAYER*\n\n` +
          `*Finalizing file and sending to chat...*`,
      );

    const resMsg = await _editResponse({ embeds: [foundEmbed] });
    return { jobId, statusMsg: resMsg };
  } catch (e) {
    if (browser) await browser.close();
    console.error("[DOCPLAYER-JS] Error:", e.message);
    await _editResponse({
      embeds: [getStatusEmbed(guild, "Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runDPlayerFlow };

module.exports = { runDPlayerFlow };
