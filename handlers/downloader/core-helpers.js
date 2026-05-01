const fs = require("fs");
const { resolveEmoji } = require("../../utils/emoji-helper");
const path = require("path");
const { advanceLog } = require("../../utils/logger");
const config = require("../../config");
const { EmbedBuilder } = require("discord.js");
const colors = require("../../utils/embed-colors");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");

const dbPath = path.join(__dirname, "../../database/downloader.json");

function loadDB() {
  if (!fs.existsSync(dbPath)) return { jobs: {} };
  return JSON.parse(fs.readFileSync(dbPath));
}

function cleanupTemp() {
  const tempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) return;

  const now = Date.now();
  const expiry = 10 * 60 * 1000;

  const sweep = (dir) => {
    try {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      items.forEach((item) => {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          sweep(itemPath);
        } else if (stats.isFile()) {
          const age = now - stats.mtimeMs;
          if (age > expiry) {
            fs.unlinkSync(itemPath);
          }
        }
      });
    } catch (e) {
      console.error(`[CLEANUP] Error during sweep in ${dir}:`, e.message);
    }
  };

  sweep(tempDir);
}

function saveDB(db) {
  const now = Date.now();
  const expiry = 10 * 60 * 1000;

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

async function safeUpdateStatus(target, data) {
  try {
    const payload = typeof data === "string" ? { content: data } : data;
    if (target.editReply) {
      await target.editReply(payload);
    } else {
      await target.edit(payload);
    }
  } catch (e) {
    // Silent
  }
}

function createProgressUpdater(target, title) {
  let lastUpdate = 0;
  const updateInterval = 2000;
  let cachedEmojis = null;

  return async (percent, speed = "", eta = "") => {
    const now = Date.now();
    if (percent < 100 && now - lastUpdate < updateInterval) return;
    lastUpdate = now;

    const guild = target.guild || target.client?.guilds?.cache.first();
    const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

    const ARROW = getEmoji("arrow", "•");
    const FIRE = getEmoji("purple_fire", "🔥");
    const AMOGUS = getEmoji("lea", "🛰️");

    const size = 15;
    const progress = Math.min(size, Math.floor(size * (percent / 100)));
    const bar = "█".repeat(progress) + "░".repeat(size - progress);

    const embed = new EmbedBuilder()
      .setColor(colors.CORE)
      .setDescription(
        `### ${FIRE} **Download in progress...**\n` +
          `${ARROW} **Title:** *${title}*\n` +
          `${ARROW} **Speed:** *${speed || "---"}*  •  *${eta || "---"}*\n\n` +
          `**${bar}**  *${percent.toFixed(1)}%*`,
      );

    await safeUpdateStatus(target, { content: "", embeds: [embed] });
  };
}

function formatNumber(num) {
  if (typeof num === "string" && (num.includes("K") || num.includes("M")))
    return num;
  const n = parseInt(num);
  if (isNaN(n)) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(2) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(input) {
  if (!input) return "---";
  if (typeof input === "string" && input.includes(":")) {
    return input.split(".")[0];
  }
  const n = parseFloat(input);
  if (isNaN(n)) return input || "---";
  const s = Math.floor(n);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, "0")}`;
}

function formatUptime(uptimeSeconds) {
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function sanitizeFilename(title, fallback = "media") {
  return (
    (title || fallback)
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^\w\s-]/gi, "")
      .trim()
      .replace(/\s+/g, "_")
      .substring(0, 60) || `${fallback}_${Date.now()}`
  );
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

function generateJobId() {
  return Math.random().toString(36).substring(2, 10);
}

function getUserId(target) {
  return target.user?.id || target.author?.id || "unknown";
}

function createJob(target, data = {}) {
  const jobId = data.jobId || generateJobId();
  const db = loadDB();
  db.jobs[jobId] = {
    url: "",
    timestamp: Date.now(),
    stats: {},
    thumbnail: "",
    platform: "Generic",
    userId: getUserId(target),
    isGallery: false,
    hasVideo: false,
    ...data,
  };
  if (db.jobs[jobId].jobId) delete db.jobs[jobId].jobId;
  saveDB(db);
  return jobId;
}

function createHandlerContext(target, options = {}) {
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

  const ctx = {
    guild,
    getEmoji,
    statusMsg: options.statusMsg || null,
    ARROW: getEmoji("arrow", "•"),
    statusEmbed: (status, details, color) =>
      getStatusEmbed(guild, status, details, color),
  };

  ctx.editResponse = async (data) => {
    return await editResponse(target, ctx.statusMsg, data);
  };

  ctx.init = async (platformName, statusText, opts = {}) => {
    if (ctx.statusMsg) {
      if (opts.silent !== true) {
        await ctx
          .editResponse({
            embeds: [getStatusEmbed(guild, platformName, statusText)],
          })
          .catch(() => {});
      }
    } else {
      ctx.statusMsg = await sendInitialStatus(target, platformName, statusText);
    }
  };

  return ctx;
}

module.exports = {
  loadDB,
  saveDB,
  safeUpdateStatus,
  createProgressUpdater,
  cleanupTemp,
  formatNumber,
  formatSize,
  formatDuration,
  formatUptime,
  sanitizeFilename,
  downloadQueue,
  advanceLog,
  generateJobId,
  getUserId,
  createJob,
  createHandlerContext,
};
