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
  if (commandName === "scan") {
    return await handleScan(interaction);
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

  const LOCK = resolveEmoji(interaction.guild, "cash", "🔒") !== "🔒"
    ? resolveEmoji(interaction.guild, "cash", "🔒")
    : resolveEmoji(interaction.guild, "crowncyan", "🔒");
  const POWER = resolveEmoji(interaction.guild, "ping_green", "🟢") !== "🟢"
    ? resolveEmoji(interaction.guild, "ping_green", "🟢")
    : resolveEmoji(interaction.guild, "online", "🟢");

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
  const FIRE = resolveEmoji(interaction.guild, "purple_fire", "🔥");

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

  const tempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) {
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
  const dbDir = path.join(__dirname, "../../database");
  const backupDir = path.join(dbDir, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const currentBackupDir = path.join(backupDir, `backup-${timestamp}`);
  fs.mkdirSync(currentBackupDir);

  advanceLog(interaction.client, {
    type: "admin",
    title: "Data Backup",
    activity: "Database Backup",
    message: `System database backup created: \`backup-${timestamp}\``,
    user: `${interaction.user.tag}`,
    guild: interaction.guild.name,
  });

  const files = fs.readdirSync(dbDir).filter((f) => f.endsWith(".json"));
  const attachments = [];

  files.forEach((f) => {
    const filePath = path.join(dbDir, f);
    fs.copyFileSync(filePath, path.join(currentBackupDir, f));
    attachments.push(new AttachmentBuilder(filePath));
  });

  const LEA = resolveEmoji(interaction.guild, "ping_green", "✅");

  await (interaction.deferred
    ? interaction.editReply({
        content: `### ${LEA} **Backup Successful**\n*The System Logs have been saved and sent to this channel. File: \`backup-${timestamp}\`*`,
        files: attachments,
      })
    : interaction.reply({
        content: `### ${LEA} **Backup Successful**\n*The System Logs have been saved and sent to this channel. File: \`backup-${timestamp}\`*`,
        files: attachments,
        flags: [MessageFlags.Ephemeral],
      }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 180000);
}

async function handleScan(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const EMOJIS = {
    FIRE: resolveEmoji(interaction.guild, "purple_fire", "🔥"),
    CROSS: resolveEmoji(interaction.guild, "ping_red", "🔴"),
  };

  const results = [];
  const platforms = [
    { name: "YOUTUBE", url: "https://www.youtube.com" },
    { name: "TIKTOK", url: "https://www.tiktok.com" },
    { name: "INSTAGRAM", url: "https://www.instagram.com" },
    { name: "TWITTER (X)", url: "https://www.twitter.com" },
    { name: "FACEBOOK", url: "https://www.facebook.com" },
    { name: "BANDCAMP", url: "https://www.bandcamp.com" },
  ];

  for (const p of platforms) {
    const start = Date.now();
    try {
      await new Promise((resolve, reject) => {
        const child = exec(`curl -s -L -m 5 ${p.url}`);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code ${code}`));
        });
        child.on("error", reject);
      });
      results.push(`${EMOJIS.FIRE} **${p.name}:** \`${Date.now() - start}ms\``);
    } catch (e) {
      results.push(`${EMOJIS.CROSS} **${p.name}:** \`Timed Out / Blocked\``);
    }
  }

  const NOTIF = resolveEmoji(interaction.guild, "notif", "🔔");
  const ARROW = resolveEmoji(interaction.guild, "arrow", "•");
  const embed = new EmbedBuilder()
    .setColor(colors.ADMIN)
    .setTitle(`${NOTIF} **Checking Connections**`)
    .setDescription(
      results.join("\n") +
        "\n\n*No connection issues found. Everything looks good.*",
    );

  await interaction.editReply({ embeds: [embed] });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
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
  const PC = resolveEmoji(interaction.guild, "pc", "💻");

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
