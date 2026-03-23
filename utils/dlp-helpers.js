const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { spawn } = require("child_process");

function getYtDlp() {
  const localPath = path.join(__dirname, "../yt-dlp");
  if (fs.existsSync(localPath)) return localPath;
  return process.env.YT_DLP_BINARY_PATH || "yt-dlp";
}

async function autoUpdateYtDlp() {
  return new Promise((resolve) => {
    console.log("[YT-DLP] Checking for updates...");
    const updater = spawn(getYtDlp(), ["-U"], { env: getDlpEnv() });

    updater.stdout.on("data", (data) => {
      console.log(`[YT-DLP] ${data.toString().trim()}`);
    });

    updater.on("close", (code) => {
      if (code === 0) console.log("[YT-DLP] Update process completed.");
      else
        console.log(
          `[YT-DLP] Update failed or not supported for this binary (Code: ${code}).`,
        );
      resolve();
    });
  });
}

function checkCookiesStatus() {
  const cookiesPath = path.join(__dirname, "../cookies.txt");
  if (!fs.existsSync(cookiesPath)) {
    return { exists: false, status: "Missing", color: 0xff0000 };
  }

  const stats = fs.statSync(cookiesPath);
  const now = Date.now();
  const daysOld = Math.floor((now - stats.mtimeMs) / (1000 * 60 * 60 * 24));

  if (daysOld > 14)
    return { exists: true, daysOld, status: "Expired/Old", color: 0xffa500 };
  return { exists: true, daysOld, status: "Active", color: 0x00ff00 };
}

function getDlpEnv() {
  const env = { ...process.env };
  const nodeBinary = process.execPath;
  const nodeDir = path.dirname(nodeBinary);

  if (env.PATH) {
    if (!env.PATH.includes(nodeDir)) env.PATH = `${nodeDir}:${env.PATH}`;
  } else {
    env.PATH = nodeDir;
  }

  env.YT_DLP_JS_RUNTIME = "node";
  return env;
}

function getJsRuntimeArgs() {
  return ["--js-runtimes", "node", "--remote-components", "ejs:github"];
}
function getCookiesArgs() {
  const args = [];

  if (process.env.SKIP_LOCAL_COOKIES !== "true") {
    const cookiesPath = path.join(__dirname, "../cookies.txt");
    if (fs.existsSync(cookiesPath)) {
      args.push("--cookies", cookiesPath);
    }
  }

  if (process.env.YT_COOKIES_BROWSER) {
    args.push("--cookies-from-browser", process.env.YT_COOKIES_BROWSER);
  }

  return args;
}

function getVpsArgs() {
  const isMac = process.platform === "darwin";
  const userAgent =
    isMac
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

  const clients = process.env.YT_PLAYER_CLIENTS || "tv,mweb,ios";
  const extractorArgs = [`player_client=${clients}`];

  if (process.env.YT_PO_TOKEN) {
    extractorArgs.push(`po_token=${process.env.YT_PO_TOKEN}`);
  }
  if (process.env.YT_VISITOR_DATA) {
    extractorArgs.push(`visitor_data=${process.env.YT_VISITOR_DATA}`);
  }

  const args = [
    "--no-mtime",
    "--ignore-config",
    "--user-agent",
    process.env.YT_USER_AGENT || userAgent,
    "--no-check-certificate",
    "--extractor-args",
    `youtube:${extractorArgs.join(";")}`,
    "--add-header",
    "Accept-Language:id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "--referer",
    "https://www.youtube.com/",
  ];

  return args;
}

module.exports = {
  getYtDlp,
  autoUpdateYtDlp,
  checkCookiesStatus,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
};
