const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
let tunnelUrl = null;
let cfProcess = null;
let currentPort = 3033;
let healthCheckInterval = null;
let failureCount = 0;
let isResetting = false;
let tunnelStartTime = 0;

function launchCloudflared(port, resolve) {
  if (cfProcess) {
    try {
      cfProcess.kill();
    } catch (e) {}
  }

  console.log("[TUNNEL] Connecting to edge...");
  const cfBinary =
    process.platform === "darwin"
      ? fs.existsSync("/opt/homebrew/bin/cloudflared")
        ? "/opt/homebrew/bin/cloudflared"
        : "cloudflared"
      : fs.existsSync("/usr/local/bin/cloudflared")
        ? "/usr/local/bin/cloudflared"
        : "cloudflared";

  cfProcess = spawn(cfBinary, [
    "tunnel",
    "--url",
    `http://localhost:${port}`,
    "--no-autoupdate",
    "--protocol",
    "http2",
  ]);

  cfProcess.stderr.on("data", (data) => {
    const output = data.toString();

    if (
      output.includes("error") ||
      output.includes("ERR") ||
      output.includes("failed")
    ) {
      const cleanMsg = output
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, "")
        .replace(/connIndex=\d+/g, "")
        .replace(/event=\d+/g, "")
        .replace(/ip=\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "")
        .replace(/error="(.+?)"/g, "$1")
        .trim();

      if (cleanMsg) console.log(`[TUNNEL] ${cleanMsg}`);
    }

    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const newUrl = match[0];
      if (tunnelUrl !== newUrl) {
        tunnelUrl = newUrl;
        tunnelStartTime = Date.now();
        console.log(`[TUNNEL] Active Hub: ${tunnelUrl}`);
        startHealthCheck();
        if (resolve) resolve(tunnelUrl);
      }
    }
  });

  cfProcess.on("close", (code, signal) => {
    console.log(
      `[TUNNEL] Tunnel closed (code: ${code}, signal: ${signal}). Reconnecting...`,
    );
    tunnelUrl = null;
    setTimeout(() => launchCloudflared(port), 5000);
  });
}

async function startTunnel(port = 3033) {
  currentPort = port;
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  app.use(
    "/v",
    (req, res, next) => {
      res.setHeader("Content-Disposition", "attachment");
      next();
    },
    express.static(tempPath),
  );

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

function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    clearTimeout(healthCheckInterval);
  }
  failureCount = 0;

  const check = async () => {
    if (!tunnelUrl || isResetting) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${tunnelUrl}/health`, {
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" },
      }).catch((e) => {
        throw new Error(e.message);
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (
          (res.status === 1033 || res.status === 530) &&
          Date.now() - tunnelStartTime < 120000
        ) {
          console.log(
            `[TUNNEL-WATCHDOG] Tunnel warming up (${res.status}). Skipping...`,
          );
          failureCount = 0;
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      failureCount = 0;
    } catch (err) {
      failureCount++;
      console.warn(
        `[TUNNEL-WATCHDOG] Check failed (${err.message}). Attempt ${failureCount}/3`,
      );

      if (failureCount >= 3) {
        console.error(
          `[TUNNEL-WATCHDOG] 3 consecutive failures. Auto-recovering...`,
        );
        isResetting = true;
        await resetTunnel();
        isResetting = false;
        failureCount = 0;
      }
    }
  };

  console.log("[TUNNEL-WATCHDOG] First check in 30 seconds...");
  healthCheckInterval = setTimeout(() => {
    check();
    healthCheckInterval = setInterval(check, 60 * 1000);
  }, 30000);
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
