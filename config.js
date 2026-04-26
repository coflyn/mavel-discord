require("dotenv").config();
const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "database", "settings.json");
let savedSettings = {};

if (fs.existsSync(settingsPath)) {
  try {
    savedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch (e) {
    console.error("[CONFIG] Error reading settings.json:", e.message);
  }
}

module.exports = {
  tunnelPort: process.env.TUNNEL_PORT || "3033",
  botName: "MaveL Downloader",
  version: "1.0.0",

  botToken: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",

  allowedChannelId:
    savedSettings.downloadChannelId || process.env.DOWNLOAD_CHANNEL_ID || "",
  logsChannelId:
    savedSettings.logsChannelId || process.env.LOGS_CHANNEL_ID || "",
  musicChannelId:
    savedSettings.musicChannelId || process.env.MUSIC_CHANNEL_ID || "",
  adminChannelId:
    savedSettings.adminChannelId || process.env.ADMIN_CHANNEL_ID || "",
  gatewayChannelId:
    savedSettings.gatewayChannelId || process.env.GATEWAY_CHANNEL_ID || "",
  autoRoleId: savedSettings.autoRoleId || process.env.AUTO_ROLE_ID || "",

  prefix: ".",
};
