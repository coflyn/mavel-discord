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
  cfProcess = spawn("/opt/homebrew/bin/cloudflared", [
    "tunnel",
    "--url",
    `http://localhost:${port}`,
    "--protocol",
    "http2",
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

  cfProcess.on("close", (code) => {
    if (code !== null) {
      console.log(`[TUNNEL] Tunnel closed (${code}). Reconnecting...`);
      tunnelUrl = null;
      setTimeout(() => launchCloudflared(port), 5000);
    }
  });
}

async function startTunnel(port = 3033) {
  currentPort = port;
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  app.use("/v", express.static(tempPath));

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
      const check = setInterval(() => {
        if (tunnelUrl) {
          clearInterval(check);
          resolve(tunnelUrl);
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

module.exports = {
  startTunnel,
  resetTunnel,
  getAssetUrl,
};
