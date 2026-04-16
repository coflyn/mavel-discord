const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActivityType,
} = require("discord.js");
const config = require("./config");
const fs = require("fs");
const path = require("path");
const { advanceLog } = require("./utils/logger");
const { stopTunnel } = require("./utils/tunnel-server");
const { player } = require("./handlers/music");

// 1. Client Initialization
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
const emojiCache = new Map();
const EMOJI_TTL = 5 * 60 * 1000;

// 2. Logging Setup
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

// 3. Command & Event Loader
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

// 4. Utility Methods on Client
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

// 4. Initialization Events
client.once("clientReady", async () => {
  console.log(`[BOOT] Logged in as ${client.user.tag}`);

  const { updateServerStats } = require("./utils/stats-handler");
  client.guilds.cache.forEach((guild) => updateServerStats(guild));

  setInterval(
    () => {
      client.guilds.cache.forEach((guild) => updateServerStats(guild));
    },
    10 * 60 * 1000,
  );

  client.user.setActivity({
    name: "MaveL | .help",
    type: ActivityType.Streaming,
    url: "https://www.twitch.tv/discord",
  });
});

// 5. System Error Handlers
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT-EXCEPTION]", err.message);
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
  advanceLog(client, {
    type: "error",
    title: "Operational Alert",
    activity: "Internal Logic Warning",
    message:
      typeof reason === "string"
        ? reason
        : reason.message || "Something went wrong in the background.",
    extra: reason.stack || "No additional trace available.",
  });
});

// 6. Graceful Shutdown
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

// 7. Initialize & Login
loadModular();
client.login(config.botToken);
