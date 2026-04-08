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

  prefix: ".",

  finishReaction: "✅",
  retryCount: 2,

  messages: {
    processing: "**Processing...**\n\n_Please wait..._",
    error: "**Error**\n\n_Something went wrong. Check logs._",
  },

  timeouts: {
    quickReply: 5000,
    queueReply: 15000,
    embedReply: 30000,
    helpReply: 60000,
    searchReply: 45000,
    setupReply: 180000,
    downloadStatus: 300000,
  },
};
