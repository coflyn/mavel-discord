const { ActivityType, Events } = require("discord.js");
const config = require("../config");
const {
  cleanupTemp,
  advanceLog,
} = require("../handlers/downloader/core-helpers");
const { autoUpdateYtDlp, checkCookiesStatus } = require("../utils/dlp-helpers");
const { startTunnel } = require("../utils/tunnel-server");
const fs = require("fs");
const path = require("path");

const logPath = path.join(__dirname, "../bot.log");

const cleanupLogs = () => {
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    if (stats.size > 5 * 1024 * 1024) {
      const data = fs
        .readFileSync(logPath, "utf-8")
        .split("\n")
        .slice(-1000)
        .join("\n");
      fs.writeFileSync(logPath, data);
      console.log(
        "[System] Activity logs were getting too big, so I cleaned them up to keep things fast.",
      );
    }
  }
};

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    cleanupTemp();
    cleanupLogs();

    console.log(`[MaveL] System starting...`);
    await startTunnel(config.tunnelPort);

    await autoUpdateYtDlp();

    console.log(`[BOT] Logged in as ${client.user.tag}`);
    console.log(`[BOT] Version: ${config.version}`);

    const cookieCheck = checkCookiesStatus();
    if (config.logsChannelId) {
      await advanceLog(client, {
        title: "Platform Initialization",
        color: cookieCheck.color,
        message: `*System check complete. Identity Status: ${cookieCheck.exists ? "Verified" : "Missing"} (${cookieCheck.daysOld} days old).*`,
      });
    }

    const activities = [
      { name: "The server", type: ActivityType.Watching },
      { name: "Members", type: ActivityType.Watching },
      { name: "For requests", type: ActivityType.Watching },
      { name: "Ready to help", type: ActivityType.Streaming },
      { name: "Type /help to start", type: ActivityType.Playing },
    ];
    let i = 0;
    const updateStatus = () => {
      if (client.statusOverride) return;
      const activity = activities[i % activities.length];
      let name = activity.name;

      const mainGuild = client.guilds.cache.first();

      if (name === "Members") {
        const members = mainGuild?.memberCount || 0;
        name = `${members} Members`;
      } else if (name === "the server") {
        name = `${mainGuild?.name || "the server"}`;
      }

      client.user.setPresence({
        activities: [
          {
            name,
            type: activity.type || ActivityType.Watching,
            url: "https://youtu.be/ORGgGHMyXmg?si=glh43Fy50xGSPcxQ",
          },
        ],
        status: "online",
      });
      i++;
    };

    client.setTempStatus = (
      name,
      type = ActivityType.Watching,
      duration = 15000,
    ) => {
      client.statusOverride = true;
      client.user.setPresence({
        activities: [{ name, type }],
        status: "online",
      });
      if (client.statusTimeout) clearTimeout(client.statusTimeout);
      if (duration !== null) {
        client.statusTimeout = setTimeout(() => {
          client.statusOverride = false;
          updateStatus();
        }, duration);
      }
    };

    client.clearTempStatus = () => {
      client.statusOverride = false;
      if (client.statusTimeout) clearTimeout(client.statusTimeout);
      updateStatus();
    };

    setInterval(updateStatus, 60000);
    updateStatus();

    setInterval(
      () => {
        cleanupTemp();
        cleanupLogs();
      },
      1 * 60 * 1000,
    );
  },
};
