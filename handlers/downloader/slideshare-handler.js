const { getPage } = require("../../utils/browser");
const fs = require("fs");
const path = require("path");
const http = require("../../utils/http");
const { createJob, createHandlerContext } = require("./core-helpers");

async function runSlideshareFlow(target, url, options = {}) {
  let page;
  const ctx = createHandlerContext(target, options);
  const ARCHIVE = ctx.getEmoji("camera", "📷");
  await ctx.init("Searching...", "Opening the slides...", { silent: true });

  try {
    page = await getPage({
      viewport: { width: 1200, height: 800 },
    });
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

    if (page) await page.close();

    const filteredUrls = imageUrlsRaw
      .filter((u) => u && u.startsWith("http"))
      .map((u) => {
        return u.replace(/-\d+\.jpg/, "-2048.jpg").split("?")[0];
      });

    if (filteredUrls.length === 0) {
      throw new Error("Could not extract slide assets.");
    }

    const tempDir = getTempDir();

    const localPaths = [];
    const { generateJobId } = require("./core-helpers");
const { getTempDir } = require("../../utils/filetools");
    const jobId = generateJobId();

    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Working...",
          `Loading ${filteredUrls.length} pages, please wait...`,
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
          const res = await http.get(assetUrl, {
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
              const res = await http.get(fallbackUrl, {
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

    createJob(target, {
      jobId,
      url: url,
      title: docTitle,
      stats: { pages: localPaths.length, type: "Slide Download" },
      thumbnail:
        target.client?.user?.displayAvatarURL() ||
        "https://www.slideshare.net/favicon.ico",
      platform: "SlideShare",
      isGallery: true,
      imageUrls: localPaths,
    });

    return { jobId, statusMsg: ctx.statusMsg };
  } catch (e) {
    if (page) await page.close();
    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Download Failed", e.message)],
    }).catch(() => {});
    return null;
  }
}

module.exports = { runSlideshareFlow };
