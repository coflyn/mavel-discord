require("./utils/dns-bypass").initBypass();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const config = require("./config");
const fs = require("fs");
const path = require("path");
const { advanceLog } = require("./utils/logger");
const { stopTunnel } = require("./utils/tunnel-server");
const { player } = require("./handlers/music");

const NETWORK_HICCUP_CODES = [
  "521",
  "502",
  "503",
  "504",
  "ETIMEDOUT",
  "ECONNRESET",
  "Unexpected server response",
];
const isNetworkHiccup = (msg) =>
  NETWORK_HICCUP_CODES.some((code) => msg?.includes(code));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
const emojiCache = new Map();
const EMOJI_TTL = 5 * 60 * 1000;

const logPath = path.join(__dirname, "bot.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function (d) {
  logStream.write(`[${new Date().toISOString()}] ${d}\n`);
  originalConsoleLog.apply(console, arguments);
};
console.error = function (d) {
  logStream.write(`[${new Date().toISOString()}] [ERROR] ${d}\n`);
  originalConsoleError.apply(console, arguments);
};

const loadModular = () => {
  const loadCommands = (dir) => {
    const files = fs.readdirSync(path.join(__dirname, dir));
    for (const file of files) {
      const stat = fs.lstatSync(path.join(__dirname, dir, file));
      if (stat.isDirectory()) {
        loadCommands(path.join(dir, file));
      } else if (file.endsWith(".js")) {
        const command = require(path.join(__dirname, dir, file));
        if (command.name) {
          const parts = dir.split(path.sep);
          command.category = parts[parts.length - 1];
          client.commands.set(command.name, command);
        }
      }
    }
  };

  const eventFiles = fs
    .readdirSync(path.join(__dirname, "events"))
    .filter((f) => f.endsWith(".js"));
  for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  loadCommands("commands");
  console.log(
    `[SYSTEM] Loaded ${client.commands.size} commands and ${eventFiles.length} events.`,
  );
};

client.getGuildEmojis = async (guildId) => {
  const cached = emojiCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < EMOJI_TTL) return cached.emojis;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const emojis = await guild.emojis.fetch();
    emojiCache.set(guildId, { emojis, timestamp: Date.now() });
    return emojis;
  } catch (e) {
    console.error(`[EMOJI-CACHE] Error fetching for ${guildId}:`, e.message);
    return null;
  }
};

client.once("clientReady", async () => {
  console.log(`[BOOT] Logged in as ${client.user.tag}`);
});

process.on("uncaughtException", (err) => {
  console.error("[CRITICAL-ERROR]", err);

  if (isNetworkHiccup(err.message)) {
    console.log(
      "[System] Connection hiccup detected. MaveL is attempting to stabilize...",
    );
    return;
  }

  advanceLog(client, {
    type: "error",
    title: "Critical System Error",
    activity: "Uncaught Exception",
    message: err.message,
    extra: err.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[INTERNAL-WARNING]", reason);

  const reasonMsg = typeof reason === "string" ? reason : reason.message || "";
  if (isNetworkHiccup(reasonMsg)) return;

  advanceLog(client, {
    type: "error",
    title: "Operational Alert",
    activity: "Internal Logic Warning",
    message: reasonMsg || "Something went wrong in the background.",
    extra: reason.stack || "No additional trace available.",
  });
});

async function gracefulShutdown(signal) {
  console.log(
    `\n[System] MaveL is going to sleep now. Everything is saved. Bye!`,
  );
  if (player?.queues) {
    for (const guildId of player.queues.keys()) {
      try {
        player.stop(guildId);
      } catch (e) {}
    }
  }
  try {
    stopTunnel();
  } catch (e) {}
  if (client) client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

loadModular();
client.login(config.botToken);
