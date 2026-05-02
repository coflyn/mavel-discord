const { chromium } = require("playwright");

let globalBrowser = null;
let isLaunching = false;
let launchPromise = null;

async function getBrowser() {
  if (globalBrowser) return globalBrowser;

  if (isLaunching) {
    await launchPromise;
    return globalBrowser;
  }

  isLaunching = true;
  launchPromise = new Promise(async (resolve, reject) => {
    try {
      globalBrowser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });
      console.log("[BROWSER] Global Playwright instance launched.");
      resolve();
    } catch (e) {
      console.error("[BROWSER] Failed to launch:", e.message);
      reject(e);
    } finally {
      isLaunching = false;
    }
  });

  await launchPromise;
  return globalBrowser;
}

async function closeBrowser() {
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
    console.log("[BROWSER] Global Playwright instance closed.");
  }
}

async function getPage(options = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext(options);
  const page = await context.newPage();

  const originalClose = page.close.bind(page);
  page.close = async () => {
    try {
      await originalClose();
    } catch (e) {}
    try {
      await context.close();
    } catch (e) {}
  };

  return page;
}

module.exports = {
  getBrowser,
  closeBrowser,
  getPage,
};
