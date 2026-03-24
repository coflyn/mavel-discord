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
            console.log(
              `[CLEANUP] Deleting expired file: ${item} (Age: ${Math.round(age / 1000)}s)`,
            );
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
    if (guild && !cachedEmojis) {
      cachedEmojis = await guild.emojis.fetch().catch(() => null);
    }

    const getEmoji = (name, fallback) => {
      const emoji = cachedEmojis?.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", ">");
    const FIRE = getEmoji("purple_fire", "🔥");
    const AMOGUS = getEmoji("amogus", "🛰️");

    const size = 15;
    const progress = Math.min(size, Math.floor(size * (percent / 100)));
    const bar = "█".repeat(progress) + "░".repeat(size - progress);

    const embed = new EmbedBuilder()
      .setColor("#00008b")
      .setDescription(
        `### ${FIRE} **Processing active...**\n` +
          `${ARROW} **Resource:** *${title}*\n` +
          `${ARROW} **Metrics:** *${speed || "---"}*  •  *${eta || "---"}*\n\n` +
          `**${bar}**  *${percent.toFixed(1)}%*`,
      );

    await safeUpdateStatus(target, { content: "", embeds: [embed] });
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

    const guild = client.guilds.cache.first();
    const guildEmojis = guild ? await guild.emojis.fetch() : null;
    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis?.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", ">");
    const FIRE = getEmoji("purple_fire", "✨");
    const ROCKET = getEmoji("rocket", "🚀");
    const LEA = getEmoji("lea", "👤");
    const ONLINE = getEmoji("online", "⚙️");
    const NOTIF = getEmoji("notif", "🔔");
    const CHEST = getEmoji("chest", "📦");

    const botUser = await client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const logEmbed = new EmbedBuilder()
      .setColor("#5d3fd3")
      .setAuthor({
        name: "MaveL System Logger",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle(`${FIRE} **System Operation Log**`)
      .setImage(botBanner)
      .setDescription(
        `### ${ROCKET} **Operation Overview**\n` +
          `${ARROW} **Status:** \`${data.title || "Log Entry"}\`\n` +
          `${ARROW} **Details:** *${data.message || "No activity reported."}*`,
      )
      .addFields(
        {
          name: `${LEA} **User Context**`,
          value: `${ARROW} ${data.user || "System/Auto"}`,
          inline: true,
        },
        {
          name: `${ONLINE} **Data Engine**`,
          value: `${ARROW} ${(data.platform || "Generic").toUpperCase()}`,
          inline: true,
        },
      )
      .setFooter({
        text: "MaveL Diagnostics",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    if (data.url) {
      logEmbed.addFields({
        name: `${NOTIF} **Resource Link**`,
        value: `[Click to View](${data.url})`,
        inline: false,
      });
    }

    if (data.size) {
      logEmbed.addFields({
        name: `${CHEST} **Metadata Size**`,
        value: `\`${data.size} MB\``,
        inline: true,
      });
    }

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
