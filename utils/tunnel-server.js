const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
let tunnelUrl = null;
let cfProcess = null;
let currentPort = 3033;

function launchCloudflared(port, resolve) {
  if (cfProcess) {
    try {
      cfProcess.kill();
    } catch (e) {}
  }

  console.log("[TUNNEL] Connecting to edge...");
  const cfBinary = process.platform === "darwin" 
    ? (fs.existsSync("/opt/homebrew/bin/cloudflared") ? "/opt/homebrew/bin/cloudflared" : "cloudflared")
    : (fs.existsSync("/usr/local/bin/cloudflared") ? "/usr/local/bin/cloudflared" : "cloudflared");

  cfProcess = spawn(cfBinary, [
    "tunnel",
    "--url",
    `http://127.0.0.1:${port}`,
    "--no-autoupdate",
  ]);

  cfProcess.stderr.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const newUrl = match[0];
      if (tunnelUrl !== newUrl) {
        tunnelUrl = newUrl;
        console.log(`[TUNNEL] Active Hub: ${tunnelUrl}`);
        if (resolve) resolve(tunnelUrl);
      }
    }
  });

  cfProcess.on("close", (code, signal) => {
    console.log(`[TUNNEL] Tunnel closed (code: ${code}, signal: ${signal}). Reconnecting...`);
    tunnelUrl = null;
    setTimeout(() => launchCloudflared(port), 5000);
  });
}

async function startTunnel(port = 3033) {
  currentPort = port;
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  app.use("/v", (req, res, next) => {
    res.setHeader("Content-Disposition", "attachment");
    next();
  }, express.static(tempPath));

  app.get("/health", (req, res) => {
    res.json({ status: "OK", uptime: process.uptime() });
  });

  return new Promise((resolve) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`[TUNNEL] Server active on port ${port}`);
    });

    server.timeout = 20 * 60 * 1000;
    server.keepAliveTimeout = 65000;

    launchCloudflared(port, resolve);
  });
}

async function resetTunnel() {
  console.log("[TUNNEL] Force resetting connection...");
  tunnelUrl = null;
  if (cfProcess) {
    cfProcess.kill();
    return new Promise((resolve) => {
      let timeoutCounter = 0;
      const check = setInterval(() => {
        if (tunnelUrl) {
          clearInterval(check);
          resolve(tunnelUrl);
        }

        timeoutCounter++;
        if (timeoutCounter >= 30) {
          console.error("[TUNNEL] Failed to reset tunnel after 30 seconds.");
          clearInterval(check);
          resolve(null);
        }
      }, 1000);
    });
  }
  return null;
}

function getAssetUrl(filename) {
  if (!tunnelUrl) return null;
  return `${tunnelUrl}/v/${encodeURIComponent(filename)}`;
}

function stopTunnel() {
  if (cfProcess) {
    cfProcess.removeAllListeners("close");
    cfProcess.kill();
    cfProcess = null;
  }
}

module.exports = {
  startTunnel,
  resetTunnel,
  stopTunnel,
  getAssetUrl,
};
