const fs = require("fs");
const path = require("path");
const config = require("../../config");
const { EmbedBuilder } = require("discord.js");

const dbPath = path.join(__dirname, "../../database/downloader.json");

function loadDB() {
  if (!fs.existsSync(dbPath)) return { jobs: {} };
  return JSON.parse(fs.readFileSync(dbPath));
}

function cleanupTemp() {
  const tempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) return;

  try {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const expiry = 3 * 60 * 60 * 1000;

    files.forEach((file) => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > expiry) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (e) {
    console.error("[TEMP-CLEANUP] Error:", e.message);
  }
}

function saveDB(db) {
  const now = Date.now();
  const expiry = 3 * 60 * 60 * 1000;

  if (db.jobs) {
    for (const jobId in db.jobs) {
      if (now - db.jobs[jobId].timestamp > expiry) {
        delete db.jobs[jobId];
      }
    }
  }

  cleanupTemp();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function safeUpdateStatus(message, content) {
  try {
    if (message.editReply) {
      await message.editReply({ content });
    } else {
      await message.edit(content);
    }
  } catch (e) {
    // Silent
  }
}

function createProgressUpdater(message, title) {
  let lastUpdate = 0;
  const updateInterval = 1500;

  return async (percent, speed = "", eta = "") => {
    const now = Date.now();
    if (percent < 100 && now - lastUpdate < updateInterval) return;
    lastUpdate = now;

    const size = 20;
    const progress = Math.min(size, Math.floor(size * (percent / 100)));
    const bar = "█".repeat(progress) + "░".repeat(size - progress);

    const metrics = speed && eta ? `  *${speed}*  •  *${eta}*` : "";
    const text = `*Downloading: ${title}*\n*${bar}*  *${percent.toFixed(1)}%*${metrics}`;

    await safeUpdateStatus(message, text);
  };
}

function formatNumber(num) {
  const n = parseInt(num);
  if (isNaN(n)) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

class TaskQueue {
  constructor() {
    this.queue = [];
    this.currentTask = null;
  }

  async add(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.next();
    });
  }

  async next() {
    if (this.currentTask || this.queue.length === 0) return;

    this.currentTask = this.queue.shift();
    try {
      const result = await this.currentTask.taskFn();
      if (this.currentTask.resolve) this.currentTask.resolve(result);
    } catch (e) {
      if (this.currentTask.reject) this.currentTask.reject(e);
    } finally {
      this.currentTask = null;
      this.next();
    }
  }
}

const downloadQueue = new TaskQueue();

async function sendAdminLog(client, data) {
  if (!config.logsChannelId) return;
  try {
    const channel = await client.channels.fetch(config.logsChannelId);
    if (!channel) return;

    const logEmbed = new EmbedBuilder()
      .setTitle(data.title || "Log Entry")
      .setColor(0x000000)
      .setDescription(`*${data.message || "No description provided."}*`)
      .addFields(
        { name: "User", value: data.user || "Unknown", inline: true },
        {
          name: "Platform",
          value: (data.platform || "General").toUpperCase(),
          inline: true,
        },
      )
      .setTimestamp();

    if (data.url)
      logEmbed.addFields({ name: "Source", value: `[Link](${data.url})` });
    if (data.size)
      logEmbed.addFields({
        name: "Size",
        value: `*${data.size} MB*`,
        inline: true,
      });

    await channel.send({ embeds: [logEmbed] });
  } catch (e) {
    console.error("[ADMIN-LOG] Error:", e.message);
  }
}

module.exports = {
  loadDB,
  saveDB,
  safeUpdateStatus,
  createProgressUpdater,
  cleanupTemp,
  formatNumber,
  downloadQueue,
  sendAdminLog,
};
