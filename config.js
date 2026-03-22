require("dotenv").config();

module.exports = {
  botName: "MaveL Downloader",
  version: "1.0.0",

  botToken: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  allowedChannelId: process.env.DOWNLOAD_CHANNEL_ID || "",
  logsChannelId: process.env.LOGS_CHANNEL_ID || "",
  musicChannelId: process.env.MUSIC_CHANNEL_ID || "",

  prefix: "!",

  finishReaction: "✅",
  retryCount: 2,

  messages: {
    processing: "**Processing...**\n\n_Please wait..._",
    error: "**Error**\n\n_Something went wrong. Check logs._",
  },
};
