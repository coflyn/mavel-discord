const { ActivityType, Events } = require("discord.js");
const config = require("../config");
const { cleanupTemp, sendAdminLog } = require("../handlers/downloader/core-helpers");
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
        "[SYSTEM] Log rotated: File size exceeded 5MB. Trimmed to 1000 lines.",
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

    console.log(`[BOT] Booting up...`);
    await startTunnel(config.tunnelPort);

    await autoUpdateYtDlp();

    console.log(`[BOT] Logged in as ${client.user.tag}`);
    console.log(`[BOT] Version: ${config.version}`);

    const cookieCheck = checkCookiesStatus();
    if (config.logsChannelId) {
      await sendAdminLog(client, {
        title: "MaveL Status",
        color: cookieCheck.color,
        message: `*System updated. Cookies: ${cookieCheck.status}${cookieCheck.exists ? ` (${cookieCheck.daysOld} days old)` : ""}.*`,
      });
    }

    const activities = [
      { name: "Music & Downloads", type: 3 },
      { name: "Your requests", type: 3 },
      { name: "Connected servers", type: 3 },
      { name: "Active users", type: 3 },
      { name: "/help | @MaveL", type: 3 },
    ];
    let i = 0;
    const updateStatus = () => {
      if (client.statusOverride) return;
      const activity = activities[i % activities.length];
      let name = activity.name;

      if (name === "Active users") {
        const users = client.users.cache.size || 0;
        name = `${users} users`;
      } else if (name === "Connected servers") {
        const guilds = client.guilds.cache.size || 0;
        name = `${guilds} servers`;
      }

      client.user.setPresence({
        activities: [{ name, type: activity.type || ActivityType.Watching }],
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
