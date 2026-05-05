const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { advanceLog } = require("../../utils/logger");
const colors = require("../../utils/embed-colors");
const { getTempDir } = require("../../utils/filetools");

const settingsPath = path.join(__dirname, "../../database/settings.json");

module.exports = async function adminCmdsHandler(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const errorMsg = "*Error: Access Denied. You need Administrator permission to use this system command.*";
    await (interaction.deferred
      ? interaction.editReply({
          content: errorMsg,
        })
      : interaction.reply({
          content: errorMsg,
          flags: [MessageFlags.Ephemeral],
        }));
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }

  const { commandName } = interaction;

  if (commandName === "hibernate") {
    return await toggleHibernate(interaction, true);
  }
  if (commandName === "wakeup") {
    return await toggleHibernate(interaction, false);
  }
  if (commandName === "purge") {
    return await handlePurge(interaction);
  }
  if (commandName === "backup") {
    return await handleBackup(interaction);
  }
  if (commandName === "logs") {
    return await handleLogs(interaction);
  }
};

async function toggleHibernate(interaction, status) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "*Error: Admin permission needed.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  const db = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath))
    : { isHibernating: false };
  db.isHibernating = status;
  fs.writeFileSync(settingsPath, JSON.stringify(db, null, 2));

  advanceLog(interaction.client, {
    type: status ? "warning" : "online",
    title: "System Status Changed",
    activity: status ? "Hibernate Mode: ON" : "Hibernate Mode: OFF",
    message: `Administrator has ${status ? "put the system to sleep" : "woken up the system"}.`,
    user: `${interaction.user.tag}`,
    guild: interaction.guild.name,
  });

  const LOCK = resolveEmoji(interaction, "cash", "🔒") !== "🔒"
    ? resolveEmoji(interaction, "cash", "🔒")
    : resolveEmoji(interaction, "crowncyan", "🔒");
  const POWER = resolveEmoji(interaction, "ping_green", "🟢") !== "🟢"
    ? resolveEmoji(interaction, "ping_green", "🟢")
    : resolveEmoji(interaction, "online", "🟢");

  await (interaction.deferred
    ? interaction.editReply({
        content: `### ${status ? LOCK : POWER} **Sleep Mode Updated**\n*Sleep mode: **${status ? "ON" : "OFF"}***`,
      })
    : interaction.reply({
        content: `### ${status ? LOCK : POWER} **Sleep Mode Updated**\n*Sleep mode: **${status ? "ON" : "OFF"}***`,
        flags: [MessageFlags.Ephemeral],
      }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
}

async function handlePurge(interaction) {
  const target = interaction.options.getString("target");
  const FIRE = resolveEmoji(interaction, "purple_fire", "🔥");

  if (target === "logs") {
    const logPath = path.join(__dirname, "../../bot.log");
    if (!fs.existsSync(logPath)) {
      await (interaction.deferred
        ? interaction.editReply({
            content: "*No log files found.*",
          })
        : interaction.reply({
            content: "*No log files found.*",
            flags: [MessageFlags.Ephemeral],
          }));
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }

    fs.writeFileSync(logPath, "");

    advanceLog(interaction.client, {
      type: "admin",
      title: "System Cleanup",
      activity: "Log Purge",
      message: "System log files have been cleared manually.",
      user: `${interaction.user.tag}`,
      guild: interaction.guild.name,
    });

    await (interaction.deferred
      ? interaction.editReply({
          content: `### ${FIRE} **Cleanup Finished**\n*The system logs (**bot.log**) have been cleared.*`,
        })
      : interaction.reply({
          content: `### ${FIRE} **Cleanup Finished**\n*The system logs (**bot.log**) have been cleared.*`,
          flags: [MessageFlags.Ephemeral],
        }));
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }

  const tempDir = getTempDir();
  if (!require("fs").existsSync(tempDir)) {
    await (interaction.deferred
      ? interaction.editReply({
          content: "*No temporary files found.*",
        })
      : interaction.reply({
          content: "*No temporary files found.*",
          flags: [MessageFlags.Ephemeral],
        }));
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }

  const files = fs.readdirSync(tempDir);
  let count = 0;

  const rmRecursive = (dir) => {
    const items = fs.readdirSync(dir);
    items.forEach((item) => {
      const itemPath = path.join(dir, item);
      if (item === ".gitkeep") return;
      try {
        if (fs.statSync(itemPath).isDirectory()) {
          rmRecursive(itemPath);
          fs.rmdirSync(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
        count++;
      } catch (e) {}
    });
  };

  rmRecursive(tempDir);

  await (interaction.deferred
    ? interaction.editReply({
        content: `### ${FIRE} **Cleanup Finished**\n*Removed **${count}** temporary files from the system.*`,
      })
    : interaction.reply({
        content: `### ${FIRE} **Cleanup Finished**\n*Removed **${count}** temporary files from the system.*`,
        flags: [MessageFlags.Ephemeral],
      }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
}

async function handleBackup(interaction) {
  const { spawn } = require("child_process");
  const { getAssetUrl } = require("../../utils/tunnel-server");
  const dbDir = path.join(__dirname, "../../database");
  const tempDir = getTempDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipName = `backup-${timestamp}.zip`;
  const zipPath = path.join(tempDir, zipName);

  const CHECK = resolveEmoji(interaction, "ping_green", "✅");
  const TIME = resolveEmoji(interaction, "time", "⌛");

  await (interaction.deferred
    ? interaction.editReply({
        content: `### ${TIME} **Creating Backup...**\n*Packaging database files into a secure archive...*`,
      })
    : interaction.reply({
        content: `### ${TIME} **Creating Backup...**\n*Packaging database files into a secure archive...*`,
        flags: [MessageFlags.Ephemeral],
      }));

  const zipProcess = spawn("zip", ["-j", zipPath, path.join(dbDir, "*.json")]);

  zipProcess.on("close", async (code) => {
    if (code !== 0) {
      console.error(`[BACKUP] Zip failed with code ${code}`);
      return interaction.editReply({
        content: "*Error: Failed to create database backup archive.*",
      });
    }

    advanceLog(interaction.client, {
      type: "admin",
      title: "Data Backup",
      activity: "Database Backup",
      message: `System database backup created: \`${zipName}\``,
      user: `${interaction.user.tag}`,
      guild: interaction.guild.name,
    });

    const publicUrl = getAssetUrl(zipName);
    const downloadLink = publicUrl ? `**[DOWNLOAD DATABASE BACKUP](${publicUrl})**` : "*Tunnel offline. Link unavailable.*";

    await interaction.editReply({
      content: `### ${CHECK} **Backup Successful**\n*The database has been archived and hosted securely.*\n\n${downloadLink}\n\n*This link will expire in 10 minutes.*`,
    });

    setTimeout(() => {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    }, 10 * 60 * 1000);
  });
}

async function handleLogs(interaction) {
  const logPath = path.join(__dirname, "../../bot.log");
  if (!fs.existsSync(logPath)) {
    return await interaction.reply({
      content: "*No log files found.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const logs = fs
    .readFileSync(logPath, "utf-8")
    .split("\n")
    .slice(-15)
    .join("\n");
  const PC = resolveEmoji(interaction, "pc", "💻");

  await (interaction.deferred
    ? interaction.editReply({
        content: `### ${PC} **Recent Logs (Last 15 Lines)**\n\`\`\`text\n${logs || "No logs yet."}\n\`\`\``,
      })
    : interaction.reply({
        content: `### ${PC} **Recent Logs (Last 15 Lines)**\n\`\`\`text\n${logs || "No logs yet."}\n\`\`\``,
        flags: [MessageFlags.Ephemeral],
      }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
}
