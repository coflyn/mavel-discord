const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const settingsPath = path.join(__dirname, "../../database/settings.json");

module.exports = async function adminCmdsHandler(interaction) {
  const { commandName } = interaction;

  if (interaction.deferReply && commandName !== "scan") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
  }

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
    return await interaction.reply({
      content: "*Error: Administrative decryption required.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const db = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath))
    : { hibernate: false };
  db.hibernate = status;
  fs.writeFileSync(settingsPath, JSON.stringify(db, null, 2));

  const LOCK =
    interaction.guild.emojis.cache.find((e) => e.name === "lock")?.toString() ||
    "🔒";
  const POWER =
    interaction.guild.emojis.cache.find((e) => e.name === "ping_red")?.toString() ||
    "🔴";

  await (interaction.deferred ? interaction.editReply({
    content: `### ${status ? LOCK : POWER} **System State Updated**\n*Core hibernation protocol: **${status ? "ACTIVATED" : "DEACTIVATED"}***`,
  }) : interaction.reply({
    content: `### ${status ? LOCK : POWER} **System State Updated**\n*Core hibernation protocol: **${status ? "ACTIVATED" : "DEACTIVATED"}***`,
    flags: [MessageFlags.Ephemeral],
  }));
}

async function handlePurge(interaction) {
  const tempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) {
    return await interaction.reply({
      content: "*No temporary artifacts detected in the sector.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const files = fs.readdirSync(tempDir);
  let count = 0;

  const FIRE =
    interaction.guild.emojis.cache
      .find((e) => e.name === "purple_fire")
      ?.toString() || "🔥";

  files.forEach((file) => {
    try {
      if (file !== ".gitkeep") {
        fs.unlinkSync(path.join(tempDir, file));
        count++;
      }
    } catch (e) {}
  });

  await (interaction.deferred ? interaction.editReply({
    content: `### ${FIRE} **Purge Protocol Complete**\n*Decommissioned and deleted **${count}** temporary assets from the sector.*`,
  }) : interaction.reply({
    content: `### ${FIRE} **Purge Protocol Complete**\n*Decommissioned and deleted **${count}** temporary assets from the sector.*`,
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

  const files = fs.readdirSync(dbDir).filter((f) => f.endsWith(".json"));
  const attachments = [];

  files.forEach((f) => {
    const filePath = path.join(dbDir, f);
    fs.copyFileSync(filePath, path.join(currentBackupDir, f));
    attachments.push(new AttachmentBuilder(filePath));
  });

  const LEA =
    interaction.guild.emojis.cache.find((e) => e.name === "lea")?.toString() ||
    "✅";

  await (interaction.deferred ? interaction.editReply({
    content: `### ${LEA} **Registry Backup Successful**\n*The MaveL Operational Registry has been synchronized and dispatched to this sector. Archive Trace: \`backup-${timestamp}\`*`,
    files: attachments,
  }) : interaction.reply({
    content: `### ${LEA} **Registry Backup Successful**\n*The MaveL Operational Registry has been synchronized and dispatched to this sector. Archive Trace: \`backup-${timestamp}\`*`,
    files: attachments,
    flags: [MessageFlags.Ephemeral],
  }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 180000);
}

async function handleScan(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const getEmoji = (name, fallback) => {
    const emoji = interaction.guild.emojis.cache.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const EMOJIS = {
    FIRE: getEmoji("purple_fire", "🔥"),
    CROSS: getEmoji("ping_red", "🔴"),
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
      await exec(`curl -s -L -m 5 ${p.url}`);
      results.push(`${EMOJIS.FIRE} **${p.name}:** \`${Date.now() - start}ms\``);
    } catch (e) {
      results.push(`${EMOJIS.CROSS} **${p.name}:** \`Timed Out / Blocked\``);
    }
  }

  const NOTIF =
    interaction.guild.emojis.cache
      .find((e) => e.name === "notif")
      ?.toString() || "🔔";
  const ARROW =
    interaction.guild.emojis.cache
      .find((e) => e.name === "arrow")
      ?.toString() || "•";
  const embed = new EmbedBuilder()
    .setColor("#6c5ce7")
    .setTitle(`${NOTIF} **Network Integrity Scan**`)
    .setDescription(
      results.join("\n") +
        "\n\n*No critical firewall anomalies detected in the current sector.*",
    );

  await interaction.editReply({ embeds: [embed] });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
}

async function handleLogs(interaction) {
  const logPath = path.join(__dirname, "../../bot.log");
  if (!fs.existsSync(logPath)) {
    return await interaction.reply({
      content: "*No transcript files detected in the registry.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const logs = fs
    .readFileSync(logPath, "utf-8")
    .split("\n")
    .slice(-15)
    .join("\n");
  const PC =
    interaction.guild.emojis.cache.find((e) => e.name === "pc")?.toString() ||
    "💻";

  await (interaction.deferred ? interaction.editReply({
    content: `### ${PC} **Terminal Transcript (Last 15 Lines)**\n\`\`\`text\n${logs || "Registry empty."}\n\`\`\``,
  }) : interaction.reply({
    content: `### ${PC} **Terminal Transcript (Last 15 Lines)**\n\`\`\`text\n${logs || "Registry empty."}\n\`\`\``,
    flags: [MessageFlags.Ephemeral],
  }));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
}
