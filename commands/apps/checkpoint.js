const { EmbedBuilder, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");

const dbPath = path.join(__dirname, "../../database/checkpoints.json");

function saveCheckpoint(userId, msg) {
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  let db = {};
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath));
  }

  if (!db[userId]) db[userId] = [];

  if (db[userId].length >= 25) {
    return { success: false, error: "Limit reached (Max 25 checkpoints)." };
  }

  if (db[userId].some((c) => c.id === msg.id)) {
    return {
      success: false,
      error: "This message is already in your checkpoints.",
    };
  }

  const snippet = msg.content
    ? msg.content.substring(0, 50) + (msg.content.length > 50 ? "..." : "")
    : "[Media/Embed]";

  db[userId].push({
    id: msg.id,
    url: msg.url,
    content: snippet,
    timestamp: Date.now(),
    channelId: msg.channelId,
    author: msg.author.tag,
  });

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return { success: true };
}

module.exports = {
  name: "app_checkpoint",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const msg = interaction.targetMessage;
    const userId = interaction.user.id;

    const result = saveCheckpoint(userId, msg);
    const CHECK = resolveEmoji(interaction.guild, "ping_green", "✅");
    const CROSS = resolveEmoji(interaction.guild, "ping_red", "❌");
    const FLAG = resolveEmoji(interaction.guild, "notif", "📍");

    if (!result.success) {
      return interaction.editReply({
        content: `${CROSS} **Checkpoint Failed:** ${result.error}`,
      });
    }

    await interaction.editReply({
      content: `${FLAG} **Checkpoint Saved!**`,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 10000);
  },
};
