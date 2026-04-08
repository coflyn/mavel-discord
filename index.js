const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const config = require("./config");
const fs = require("fs");
const path = require("path");
const settingsPath = path.join(__dirname, "database", "settings.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const dbDir = path.join(__dirname, "database");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const {
  cleanupTemp,
  sendAdminLog,
} = require("./handlers/downloader/core-helpers");
const { autoUpdateYtDlp, checkCookiesStatus } = require("./utils/dlp-helpers");
const downloaderHandler = require("./handlers/downloader");
const searchHandler = require("./handlers/search");
const { musicHandler, player } = require("./handlers/music");
const {
  savePlaylist,
  getPlaylists,
  deletePlaylist,
} = require("./utils/playlist-helper");
const { findLyrics } = require("./handlers/music/lyrics");
const infoHandler = require("./handlers/info");
const emojiHandler = require("./handlers/tools/emoji");
const helpHandler = require("./handlers/tools/help");
const setupHandler = require("./handlers/tools/setup");
const diagnosticsHandler = require("./handlers/tools/diagnostics");
const cookiesHandler = require("./handlers/tools/cookies");
const adminCmdsHandler = require("./handlers/tools/admin-cmds");
const { startTunnel, resetTunnel } = require("./utils/tunnel-server");

const logPath = path.join(__dirname, "bot.log");

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

const logStream = fs.createWriteStream(logPath, { flags: "a" });
const originalConsoleLog = console.log;
console.log = function (d) {
  logStream.write(`[${new Date().toISOString()}] ${d}\n`);
  originalConsoleLog.apply(console, arguments);
};

const cooldowns = new Map();
const COOLDOWN_TIME = 60000;
const MAX_COMMANDS_PER_WINDOW = 2;

const emojiCache = new Map();
const EMOJI_TTL = 5 * 60 * 1000;

client.getGuildEmojis = async (guildId) => {
  const cached = emojiCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < EMOJI_TTL) {
    return cached.emojis;
  }
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

client.once("ready", async () => {
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
      title: "MaveL System Status",
      color: cookieCheck.color,
      message: `*Engine updated. Cookies Status: ${cookieCheck.status}${cookieCheck.exists ? ` (${cookieCheck.daysOld} days old)` : ""}.*`,
    });
  }

  const activities = [
    { name: "Operational assets", type: 3 },
    { name: "Pulse Monitor", type: 0 },
    { name: "Synchronized bases", type: 3 },
    { name: "Personnel analytics", type: 3 },
    { name: "/help | @MaveL", type: 3 },
  ];
  let i = 0;
  const updateStatus = () => {
    if (client.statusOverride) return;
    const activity = activities[i % activities.length];
    let name = activity.name;

    if (name === "personnel analytics") {
      const users = client.users.cache.size || 0;
      name = `${users} personnel analytics`;
    } else if (name === "synchronized bases") {
      const guilds = client.guilds.cache.size || 0;
      name = `${guilds} synchronized bases`;
    }

    client.user.setActivity(name, { type: activity.type });
    i++;
  };

  client.setTempStatus = (name, type = 3, duration = 15000) => {
    client.statusOverride = true;
    client.user.setActivity(name, { type });
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

  setInterval(
    () => {
      cleanupTemp();
    },
    1 * 60 * 1000,
  );
});

client.on("guildCreate", async (guild) => {
  try {
    const botUser = await client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const guildEmojis = await guild.emojis.fetch();
    const ARROW =
      guildEmojis.find((e) => e.name === "arrow")?.toString() || "•";
    const LINK =
      guildEmojis.find((e) => e.name === "blue_arrow_right")?.toString() || "➡";
    const ANNO = guildEmojis.find((e) => e.name === "anno")?.toString() || "🚀";

    const welcomeEmbed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle(`${ANNO} **Operational Matrix Initialized**`)
      .setImage(botBanner)
      .setDescription(
        `### ${LINK} **MaveL Hub Induction Successful**\n` +
          `*Connection link with sector **${guild.name}** has been established. To complete the operational integration, please execute the required protocols below:*\n\n` +
          `${ARROW} **Step 1:** Run **\`/emoji needs\`** to synchronize visual assets.\n` +
          `${ARROW} **Step 2:** Run **\`/setup\`** to activate the operational core.\n` +
          `${ARROW} **Step 3:** Run **\`/cookies\`** to synchronize authentication datasets.\n\n` +
          `*Status: Waiting for administrative authorization...*`,
      )
      .setFooter({ text: "MaveL Deployment System" })
      .setTimestamp();

    const channel =
      guild.systemChannel ||
      guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me).has("SendMessages"),
      );

    if (channel) {
      await channel.send({ embeds: [welcomeEmbed] });
    }

    client.guilds.cache.forEach((oldGuild) => {
      if (oldGuild.id !== guild.id) {
        console.log(
          `[SYSTEM] New hub detected. Scheduling decommissioning of sector ${oldGuild.name} in 60s.`,
        );
        setTimeout(async () => {
          try {
            await oldGuild.leave();
            console.log(`[SYSTEM] Decommissioned sector ${oldGuild.name}.`);
          } catch (e) {
            console.error(
              `[SYSTEM] Failed to leave sector ${oldGuild.name}:`,
              e.message,
            );
          }
        }, 60000);
      }
    });
  } catch (err) {
    console.error("[GUILD-CREATE] Error sending welcome:", err.message);
  }
});
client.on("voiceStateUpdate", (oldState, newState) => {
  const guildId = oldState.guild.id;
  const state = player.queues.get(guildId);
  if (!state) return;

  const me = oldState.guild.members.me;
  const botChannel = me.voice.channel;

  if (!botChannel) {
    if (state.connection) player.stop(guildId);
    return;
  }

  const humans = botChannel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) {
    if (!state.aloneTimer) {
      state.aloneTimer = setTimeout(() => {
        const recheck = me.guild.members.me.voice.channel;
        if (recheck && recheck.members.filter((m) => !m.user.bot).size === 0) {
          player.stop(guildId);
        }
      }, 60000);
    }
  } else if (state.aloneTimer) {
    clearTimeout(state.aloneTimer);
    state.aloneTimer = null;
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.startsWith(config.prefix)
    ? message.content.slice(config.prefix.length).trim().split(/ +/)
    : [];
  const commandName = args.length > 0 ? args.shift().toLowerCase() : "";

  const isAllowed =
    !config.allowedChannelId || message.channel.id === config.allowedChannelId;
  const isMusicChannel =
    config.musicChannelId && message.channel.id === config.musicChannelId;
  const isLogsChannel =
    config.logsChannelId && message.channel.id === config.logsChannelId;

  const isHelpRequest =
    commandName === "help" ||
    (message.mentions.has(client.user.id) && !message.content.includes("http"));

  if (isHelpRequest) {
    if (isAllowed || isMusicChannel || isLogsChannel) {
      return await helpHandler(message);
    }
  }

  if (!isAllowed && !isMusicChannel) return;

  if (isMusicChannel && !message.content.startsWith(config.prefix)) {
    return await musicHandler(message).catch(() => {});
  }

  if (message.content.match(/https?:\/\/[^\s]+/)) {
    try {
      const amogusEmoji = message.guild.emojis.cache.find(
        (e) => e.name === "amogus",
      );
      await message.suppressEmbeds(true).catch(() => {});
      await message.react(amogusEmoji || "⏳").catch(() => {});
      return await downloaderHandler(message);
    } catch (e) {
      console.error("[LINK-HANDLER] Error:", e.message);
    }
  }

  if (!message.content.startsWith(config.prefix)) return;

  if (["dl", "download", "yt", "tt", "ig"].includes(commandName)) {
    await message.suppressEmbeds(true).catch(() => {});
    await message.react("⏳").catch(() => {});
    return await downloaderHandler(message);
  }

  if (commandName === "ping") {
    const guildEmojis = await message.guild.emojis.fetch();
    const latencyVal = client.ws.ping;
    const latency = latencyVal < 0 ? 0 : Math.round(latencyVal);
    const pingEmoji =
      latency < 100
        ? guildEmojis.find((e) => e.name === "ping_green") || "🟢"
        : guildEmojis.find((e) => e.name === "ping_red") || "🔴";
    const reply = await message.reply(
      `*${pingEmoji} Latency is ${latency}ms.*`,
    );
    setTimeout(() => {
      reply.delete().catch(() => {});
    }, 30000);
    return;
  }

  if (commandName === "help") {
    return await helpHandler(message);
  }

  if (commandName === "diagnostics") {
    return await diagnosticsHandler(message);
  }

  if (commandName === "cookies") {
    return await cookiesHandler(message);
  }
  if (["info", "icon", "banner", "server", "setup"].includes(commandName)) {
    const target = message.mentions.users.first() || message.author;
    const subcommand = args[0] || "info";

    const mockInteraction = {
      guild: message.guild,
      user: message.author,
      member: message.member,
      client: message.client,
      commandName: commandName,
      options: {
        getUser: () => target,
        getSubcommand: () => subcommand,
      },
      reply: async (payload) => {
        const { withResponse, ...cleanPayload } = payload;
        return await message.reply(cleanPayload);
      },
      deferReply: async () => {},
      editReply: async (payload) => {
        return await message.reply(payload);
      },
    };
    if (commandName === "setup") return await setupHandler(mockInteraction);
    return await infoHandler(mockInteraction);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const { commandName } = interaction;
    if (commandName === "playlist") {
      const lists = getPlaylists(interaction.user.id);
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const choices = Object.keys(lists).filter((n) =>
        n.toLowerCase().includes(focusedValue),
      );
      await interaction.respond(
        choices.slice(0, 25).map((choice) => ({ name: choice, value: choice })),
      );
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const userId = interaction.user.id;

    if (
      !interaction.member?.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      const now = Date.now();
      const userHistory = cooldowns.get(userId) || [];

      const validHistory = userHistory.filter(
        (timestamp) => now - timestamp < COOLDOWN_TIME,
      );

      if (validHistory.length >= MAX_COMMANDS_PER_WINDOW) {
        const oldestEntry = validHistory[0];
        const nextReset = Math.ceil(
          (COOLDOWN_TIME - (now - oldestEntry)) / 1000,
        );

        const guildEmojis = await interaction.client.getGuildEmojis?.(
          interaction.guild.id,
        );
        const TIME = guildEmojis?.find((e) => e.name === "time") || "⏳";

        return interaction.reply({
          content: `### ${TIME} **Rate Limit Active**\n> *Quota exhausted (Max 2/min). System cooling down. Resetting in **${nextReset}s**.*`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      validHistory.push(now);
      cooldowns.set(userId, validHistory);
    }
    const isMusicCmd = [
      "play",
      "skip",
      "stop",
      "nowplaying",
      "pause",
      "resume",
      "queue",
      "shuffle",
      "repeat",
      "clear",
      "remove",
      "skipto",
      "playlist",
      "lyrics",
    ].includes(commandName);
    const musicChannel = config.musicChannelId;
    const mainChannel = config.allowedChannelId;

    const isBypassCmd = [
      "setup",
      "help",
      "ping",
      "info",
      "icon",
      "banner",
      "diagnostics",
      "emoji",
      "move",
      "hibernate",
      "wakeup",
      "purge",
      "backup",
      "scan",
      "logs",
      "cookies",
    ].includes(commandName);

    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
      : {};
    const isAdmin = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator,
    );

    if (settings.isHibernating && !isAdmin && commandName !== "wakeup") {
      return interaction.reply({
        content: "*Operational Matrix Suspend. System in hibernation Mode.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const isAdminCmd = [
      "setup",
      "reset",
      "diagnostics",
      "move",
      "hibernate",
      "wakeup",
      "purge",
      "backup",
      "scan",
      "logs",
      "cookies",
    ].includes(commandName);

    if (
      isAdminCmd &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "*Unauthorized. Administrative override required.*",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (isMusicCmd && musicChannel && interaction.channel.id !== musicChannel) {
      return interaction.reply({
        content: `*Music commands only available in <#${musicChannel}>*`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (
      !isMusicCmd &&
      !isBypassCmd &&
      mainChannel &&
      interaction.channel.id !== mainChannel
    ) {
      return interaction.reply({
        content: `*Downloader commands only available in <#${mainChannel}>*`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (commandName === "dl") {
      const url = interaction.options.getString("url");
      try {
        const mockMessage = {
          content: url,
          author: interaction.user,
          channel: interaction.channel,
          reply: async (content) => {
            if (typeof content === "string") {
              return await interaction.reply({
                content,
                flags: [MessageFlags.Ephemeral],
                withResponse: true,
              });
            }
            return await interaction.reply({
              ...content,
              flags: [MessageFlags.Ephemeral],
              withResponse: true,
            });
          },
        };

        return await downloaderHandler(interaction);
      } catch (e) {
        console.error("[SLASH-HANDLER] Error:", e.message);
        try {
          if (interaction.replied) {
            await interaction
              .followUp({
                content: `*Error: ${e.message}*`,
                flags: [MessageFlags.Ephemeral],
              })
              .catch(() => {});
          } else if (interaction.deferred) {
            await interaction
              .editReply({
                content: `*Error: ${e.message}*`,
              })
              .catch(() => {});
          } else {
            await interaction
              .reply({
                content: `*Error: ${e.message}*`,
                flags: [MessageFlags.Ephemeral],
              })
              .catch(() => {});
          }
        } catch (innerErr) {
          console.error(
            "[ERROR-REPORTING-FAIL] Could not send error reply:",
            innerErr.message,
          );
        }
      }
    }

    if (commandName === "cookies") {
      return await cookiesHandler(interaction);
    }
    if (commandName === "search") {
      return await searchHandler(interaction);
    }

    if (commandName === "ping") {
      const guildEmojis = await interaction.guild.emojis.fetch();
      const latencyVal = client.ws.ping;
      const latency = latencyVal < 0 ? 0 : Math.round(latencyVal);
      const pingEmoji =
        latency < 100
          ? guildEmojis.find((e) => e.name === "ping_green") || "🟢"
          : guildEmojis.find((e) => e.name === "ping_red") || "🔴";
      const reply = await interaction.reply({
        content: `*${pingEmoji} Latency is ${latency}ms.*`,
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });

      const res = reply?.resource || reply;
      setTimeout(() => {
        if (interaction.isChatInputCommand?.()) {
          interaction.deleteReply().catch(() => {});
        } else if (res && res.delete) {
          res.delete().catch(() => {});
        }
      }, 30000);
      return;
    }

    if (commandName === "play") {
      const query = interaction.options.getString("query");
      const source = interaction.options.getString("source") || "bc";
      return await musicHandler(interaction, { title: query, source });
    }

    if (commandName === "skip") {
      player.skip(interaction.guild.id);
      const E_NEXT =
        interaction.guild.emojis.cache
          .find((e) => e.name === "blue_arrow_right")
          ?.toString() || "⏭️";
      await interaction.reply({
        content: `### ${E_NEXT} **Track bypassed. Advancing.**`,
        flags: [64],
      });
      setTimeout(
        () => interaction.deleteReply().catch(() => {}),
        config.timeouts.quickReply,
      );
      return;
    }

    if (commandName === "stop") {
      player.stop(interaction.guild.id);
      const E_STOP =
        interaction.guild.emojis.cache
          .find((e) => e.name === "ping_red")
          ?.toString() || "⏹️";
      await interaction.reply({
        content: `### ${E_STOP} **Operation decommissioned.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "pause") {
      player.pause(interaction.guild.id);
      const E_PAUSE =
        interaction.guild.emojis.cache
          .find((e) => e.name === "time")
          ?.toString() || "⏸️";
      await interaction.reply({
        content: `### ${E_PAUSE} **Stream Suspension Active.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "resume") {
      player.resume(interaction.guild.id);
      const E_RESUME =
        interaction.guild.emojis.cache
          .find((e) => e.name === "time")
          ?.toString() || "▶️";
      await interaction.reply({
        content: `### ${E_RESUME} **Transmission Resumed.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "nowplaying") {
      const embed = player.getNowPlayingEmbed(interaction.guild.id);
      if (!embed) {
        return interaction.reply({
          content: "*Nothing is playing right now.*",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(
        () => interaction.deleteReply().catch(() => {}),
        config.timeouts.queueReply,
      );
      return;
    }

    if (commandName === "queue") {
      const list = player.getQueueList(interaction.guild.id);
      const E_ANNO =
        interaction.guild.emojis.cache
          .find((e) => e.name === "anno")
          ?.toString() || "📜";
      const E_FIRE =
        interaction.guild.emojis.cache
          .find((e) => e.name === "purple_fire")
          ?.toString() || "🔥";

      if (list.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor("#a29bfe")
          .setDescription(
            `### ${E_FIRE} **Queue: Offline**\n> *No targets currently in registry.*`,
          );

        await interaction.reply({
          embeds: [emptyEmbed],
          flags: [64],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }

      const queueEmbed = new EmbedBuilder()
        .setColor("#a29bfe")
        .setAuthor({
          name: "MaveL Operation Queue",
          iconURL: client.user.displayAvatarURL(),
        })
        .setDescription(
          `### ${E_ANNO} **Synchronized Targets**\n` + list.join("\n"),
        )
        .setFooter({ text: `Hub | Pending Operations: ${list.length}` });

      await interaction.reply({
        embeds: [queueEmbed],
        flags: [64],
      });
      setTimeout(
        () => interaction.deleteReply().catch(() => {}),
        config.timeouts.embedReply,
      );
      return;
    }

    if (commandName === "shuffle") {
      const mode = interaction.options.getString("mode");
      player.toggleShuffle(interaction.guild.id, mode);
      const E_SHUFFLE =
        interaction.guild.emojis.cache
          .find((e) => e.name === "diamond")
          ?.toString() || "🔀";
      await interaction.reply({
        content: `### ${E_SHUFFLE} **Shuffle mode set to: ${mode.toUpperCase()}**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "repeat") {
      const mode = interaction.options.getString("mode");
      player.setRepeat(interaction.guild.id, mode);
      const E_REPEAT =
        interaction.guild.emojis.cache
          .find((e) => e.name === "rocket")
          ?.toString() || "🔁";

      const state = player.queues.get(interaction.guild.id);
      if (state && state.lastNowPlayingMsg) {
        const updatedEmbed = player.getNowPlayingEmbed(interaction.guild.id);
        if (updatedEmbed) {
          state.lastNowPlayingMsg
            .edit({ embeds: [updatedEmbed] })
            .catch(() => {});
        }
      }

      await interaction.reply({
        content: `### ${E_REPEAT} **Repeat Protocol: ${mode.toUpperCase()}**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "clear") {
      player.clear(interaction.guild.id);
      const E_CLEAR =
        interaction.guild.emojis.cache
          .find((e) => e.name === "lea")
          ?.toString() || "🗑️";
      await interaction.reply({
        content: `### ${E_CLEAR} **Registry wiped. Queue Offline.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "remove") {
      const num = interaction.options.getInteger("number");
      const removed = player.remove(interaction.guild.id, num);
      const E_CLEAR =
        interaction.guild.emojis.cache
          .find((e) => e.name === "lea")
          ?.toString() || "🗑️";
      if (!removed) {
        await interaction.reply({
          content: `### ${E_CLEAR} **Target not found at position #${num}.**`,
          flags: [64],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }
      await interaction.reply({
        content: `### ${E_CLEAR} **Removed track: ${removed.title}**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "skipto") {
      const num = interaction.options.getInteger("number");
      const success = player.skipto(interaction.guild.id, num);
      const E_NEXT =
        interaction.guild.emojis.cache
          .find((e) => e.name === "blue_arrow_right")
          ?.toString() || "⏭️";
      if (!success) {
        await interaction.reply({
          content: `### ${E_NEXT} **Tactical error: Track #${num} nonexistent.**`,
          flags: [64],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }
      await interaction.reply({
        content: `### ${E_NEXT} **Advancing to track #${num}.**`,
        flags: [64],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "playlist") {
      const sub = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      if (sub === "save") {
        const name = interaction.options.getString("name");
        const state = player.queues.get(interaction.guild.id);
        if (!state || (state.queue.length === 0 && !state.current)) {
          await interaction.reply({
            content: "*Nothing is playing or in queue.*",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        const allTracks = state.current
          ? [state.current, ...state.queue]
          : state.queue;
        savePlaylist(userId, name, allTracks);
        await interaction.reply({
          content: `*Playlist '${name}' saved with ${allTracks.length} tracks.*`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (sub === "list") {
        const lists = getPlaylists(userId);
        const names = Object.keys(lists);
        const FIRE =
          interaction.guild.emojis.cache
            .find((e) => e.name === "purple_fire")
            ?.toString() || "🔥";

        if (names.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setColor("#a29bfe")
            .setDescription(
              `### ${FIRE} **No Playlists**\n> *You haven't saved any playlists yet.*`,
            );

          await interaction.reply({
            embeds: [emptyEmbed],
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        const LEA =
          interaction.guild.emojis.cache
            .find((e) => e.name === "lea")
            ?.toString() || "✅";
        const ARROW =
          interaction.guild.emojis.cache
            .find((e) => e.name === "arrow")
            ?.toString() || "•";

        const listEmbed = new EmbedBuilder()
          .setColor("#a29bfe")
          .setDescription(
            `### ${LEA} **Saved Playlists**\n` +
              names
                .map((n) => `${ARROW} \`${n}\` (${lists[n].length} tracks)`)
                .join("\n"),
          )
          .setFooter({ text: `MaveL | Total Playlists: ${names.length}` });

        await interaction.reply({
          embeds: [listEmbed],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (sub === "view") {
        const name = interaction.options.getString("name");
        const playlists = getPlaylists(userId);
        const list = playlists[name.toLowerCase()];
        if (!list) {
          await interaction.reply({
            content: `*Playlist '${name}' not found.*`,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        const ARROW =
          interaction.guild.emojis.cache
            .find((e) => e.name === "arrow")
            ?.toString() || ">";
        const total = list.length;
        const tracks = list
          .slice(0, 20)
          .map((t, i) => `\`${i + 1}.\` ${t.title}`)
          .join("\n");
        const suffix =
          total > 20 ? `\n*...and ${total - 20} more tracks.*` : "";

        const viewEmbed = new EmbedBuilder()
          .setColor("#a29bfe")
          .setTitle(`Playlist: ${name}`)
          .setDescription(`${tracks}${suffix}`)
          .setFooter({ text: `Total: ${total} tracks` });

        await interaction.reply({
          embeds: [viewEmbed],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (sub === "delete") {
        const name = interaction.options.getString("name");
        const success = deletePlaylist(userId, name);
        if (!success) {
          await interaction.reply({
            content: `*Playlist '${name}' not found.*`,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        await interaction.reply({
          content: `*Playlist '${name}' deleted.*`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (sub === "play") {
        const name = interaction.options.getString("name");
        const playlists = getPlaylists(userId);
        const list = playlists[name.toLowerCase()];
        if (!list) {
          await interaction.reply({
            content: `*Playlist '${name}' not found.*`,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
          await player.playBatch(interaction, list);
          await interaction.editReply({
            content: `*Enqueued ${list.length} tracks from playlist '${name}'.*`,
          });
        } catch (e) {
          await interaction.editReply({
            content: `*Error: ${e.message}*`,
          });
        }
        return;
      }
    }

    if (commandName === "help") {
      return await helpHandler(interaction);
    }

    if (commandName === "reset") {
      const sub = interaction.options.getSubcommand();
      if (sub === "tunnel") {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildEmojis = await interaction.guild.emojis.fetch();
        const PING_GREEN =
          guildEmojis.find((e) => e.name === "ping_green")?.toString() || "🟢";
        const PING_RED =
          guildEmojis.find((e) => e.name === "ping_red")?.toString() || "🔴";

        try {
          const newUrl = await resetTunnel();
          await interaction.editReply({
            content: `### ${PING_GREEN} **Tunnel Reset Successful**\n*New Link: ${newUrl}*`,
          });
        } catch (e) {
          await interaction.editReply({
            content: `### ${PING_RED} **Tunnel Reset Failed**\n*Error: ${e.message}*`,
          });
        }
        setTimeout(
          () => interaction.deleteReply().catch(() => {}),
          config.timeouts.searchReply,
        );
        return;
      }
    }

    if (commandName === "diagnostics") {
      return await diagnosticsHandler(interaction);
    }

    if (commandName === "lyrics") {
      let query = interaction.options.getString("query");
      if (!query) {
        const state = player.queues.get(interaction.guild.id);
        if (state && state.current) {
          query = state.current.title;
        }
      }

      if (!query) {
        return interaction.reply({
          content: "*Please provide a song name or play something first.*",
          flags: [64],
        });
      }

      await interaction.deferReply({ flags: [64] });
      const lyrics = await findLyrics(query);

      if (lyrics.length > 1900) {
        const chunks = lyrics.match(/[\s\S]{1,1900}/g);
        for (let i = 0; i < chunks.length; i++) {
          if (i === 0)
            await interaction.editReply({
              content: `*Lyrics for ${query}:*\n\n${chunks[i]}`,
            });
          else await interaction.followUp({ content: chunks[i], flags: [64] });
        }
        setTimeout(() => interaction.deleteReply().catch(() => {}), 300000);
      } else {
        await interaction.editReply({
          content: `*Lyrics for ${query}:*\n\n${lyrics}`,
        });
        setTimeout(
          () => interaction.deleteReply().catch(() => {}),
          config.timeouts.setupReply,
        );
      }
      return;
    }

    if (["info", "icon", "banner", "server"].includes(commandName)) {
      return await infoHandler(interaction);
    }

    if (commandName === "emoji") {
      return await emojiHandler(interaction);
    }

    if (commandName === "move") {
      const botUser = await interaction.client.user.fetch();
      const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands`;

      const LINK =
        interaction.guild.emojis.cache
          .find((e) => e.name === "blue_arrow_right")
          ?.toString() || "➡";
      const PC =
        interaction.guild.emojis.cache
          .find((e) => e.name === "pc")
          ?.toString() || "💻";
      const ARROW =
        interaction.guild.emojis.cache
          .find((e) => e.name === "arrow")
          ?.toString() || "•";

      const moveEmbed = new EmbedBuilder()
        .setColor("#d63031")
        .setTitle("*Endpoint Migration Protocol*")
        .setImage(botBanner)
        .setDescription(
          `### ${LINK} **Bot Induction Protocol Initialized**\n` +
            `*To synchronize the MaveL Hub with a new server endpoint, utilize the induction link below. This will deploy the operational matrix across a different server environment.*\n\n` +
            `${PC} [Induct MaveL Hub to another server](${inviteUrl})\n\n` +
            `**Post-Arrival Checklist:**\n` +
            `${ARROW} *Run **\`/emoji needs\`** to sync visual assets.*\n` +
            `${ARROW} *Run **\`/setup\`** to activate the operational system.*\n` +
            `${ARROW} *Run **\`/cookies\`** to synchronize authentication datasets.*`,
        )
        .setFooter({ text: "MaveL Deployment Module" });

      await interaction.reply({
        embeds: [moveEmbed],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (
      ["hibernate", "wakeup", "purge", "backup", "scan", "logs"].includes(
        commandName,
      )
    ) {
      return await adminCmdsHandler(interaction);
    }

    if (commandName === "setup") {
      return await setupHandler(interaction);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "sync_emojis") {
      return await emojiHandler.syncMissingEmojis(interaction);
    }

    try {
      await downloaderHandler.handleDownloadCallback(interaction);
    } catch (e) {
      console.error("[BUTTON-HANDLER] Error:", e.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `*Error: ${e.message}*`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("music_select")) {
      const authorId = interaction.customId.split("_").pop();
      if (interaction.user.id !== authorId) {
        return interaction.reply({
          content: "*Selection menu is not for you.*",
          flags: [MessageFlags.Ephemeral],
        });
      }
      try {
        const { searchCache: musicCache } = require("./handlers/music/index");
        const cached = musicCache.get(interaction.values[0]);
        const playUrl = cached
          ? cached.url
          : interaction.values[0].split("|")[0];
        const rawTitle = cached
          ? cached.title
          : interaction.values[0].split("|")[1] || "Track";

        await interaction
          .update({
            content: `*Loading: ${rawTitle}*`,
            components: [],
          })
          .catch(() => {});

        return await musicHandler(interaction, {
          url: playUrl,
          title: rawTitle,
        });
      } catch (e) {
        console.error("[MUSIC-SELECT] Error:", e.message);
      }
    }

    if (interaction.customId.startsWith("search_select")) {
      const { searchCache } = require("./handlers/search/index");
      const cached = searchCache.get(interaction.values[0]);
      const url = cached?.url || interaction.values[0];
      const title = cached?.title
        ? `${cached.uploader ? cached.uploader + " - " : ""}${cached.title}`
        : "Resource";
      const subcommand = interaction.customId.split("_").pop();
      const type = ["ytm", "bc", "spot"].includes(subcommand) ? "mp3" : "mp4";

      try {
        await interaction
          .update({ content: `*Selected selection...*`, components: [] })
          .catch(() => {});

        return await downloaderHandler(interaction, {
          manualUrl: url,
          manualType: type,
          manualTitle: title,
        });
      } catch (e) {
        console.error("[SELECT-HANDLER] Error:", e.message);
      }
    }

    if (interaction.customId === "music_control_hub") {
      const value = interaction.values[0];
      const guildId = interaction.guild.id;

      if (value === "lyrics") {
        await interaction
          .update({ components: [player.getPlaybackComponents(guildId)] })
          .catch(() => {});
        const statusMsg = await interaction.followUp({
          content: "*Fetching intelligence report...*",
          flags: [64],
        });
        const state = player.queues.get(guildId);
        if (!state || !state.current) {
          return await interaction.webhook.editMessage(statusMsg.id, {
            content: "*No active stream found.*",
          });
        }

        const query = state.current.title;
        const lyrics = await findLyrics(query);

        if (!lyrics || lyrics.includes("Could not find lyrics")) {
          return await interaction.webhook.editMessage(statusMsg.id, {
            content: `### 📋 **Lyrics Retrieval: Failed**\n> *No intelligence found for track: \`${query}\`*`,
          });
        }

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_LYRICS =
          guildEmojis.find((e) => e.name === "book")?.toString() || "📋";

        const cleanLyrics =
          lyrics.length > 1900 ? lyrics.substring(0, 1900) + "..." : lyrics;

        const total = state.current.duration || 180;
        const played = state.resource
          ? Math.floor(state.resource.playbackDuration / 1000)
          : 0;
        const remaining = total - played;
        const waitTime = Math.max(remaining, 5);

        await interaction.webhook.editMessage(statusMsg.id, {
          content: `### ${E_LYRICS} **Lyrics: ${query}**\n\n${cleanLyrics}`,
        });

        setTimeout(
          () => interaction.webhook.deleteMessage(statusMsg.id).catch(() => {}),
          (waitTime + 3) * 1000,
        );
        return;
      }

      if (value === "pause") {
        const state = player.queues.get(guildId);
        if (!state) return;
        const isPaused = state.player.state.status === "paused";
        if (isPaused) player.resume(guildId);
        else player.pause(guildId);

        return await interaction
          .update({
            embeds: [player.getNowPlayingEmbed(guildId)],
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});
      }

      if (value === "shuffle") {
        const state = player.queues.get(guildId);
        if (!state) return;

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_SHUFFLE =
          guildEmojis.find((e) => e.name === "diamond")?.toString() || "🔀";

        if (state.queue.length === 0) {
          return await interaction.reply({
            content: `### ${E_SHUFFLE} **Shuffle: Engagement Denied**\n> *No upcoming targets detected in the registry.*`,
            flags: [64],
          });
        }
        const newMode = state.shuffle ? "off" : "on";
        player.toggleShuffle(guildId, newMode);

        await interaction
          .update({
            embeds: [player.getNowPlayingEmbed(guildId)],
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});
        return await interaction.followUp({
          content: `### ${E_SHUFFLE} **Shuffle: ${newMode.toUpperCase()}**`,
          flags: [64],
        });
      }

      if (value === "repeat") {
        const state = player.queues.get(guildId);
        if (!state) return;

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_REPEAT =
          guildEmojis.find((e) => e.name === "rocket")?.toString() || "🔁";

        const cycle = { off: "one", one: "all", all: "off" };
        const nextMode = cycle[state.repeatMode || "off"];
        player.setRepeat(guildId, nextMode);

        await interaction
          .update({
            embeds: [player.getNowPlayingEmbed(guildId)],
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});
        return await interaction.followUp({
          content: `### ${E_REPEAT} **Repeat: ${nextMode.toUpperCase()}**`,
          flags: [64],
        });
      }

      if (value === "queue") {
        const list = player.getQueueList(guildId);

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_ANNO =
          guildEmojis.find((e) => e.name === "anno")?.toString() || "📜";

        if (list.length === 0) {
          return await interaction.reply({
            content: `### ${E_ANNO} **Upcoming Queue**\n> *Queue is currently clear.*`,
            flags: [64],
          });
        }
        const text =
          list.join("\n").length > 1900
            ? list.slice(0, 15).join("\n") + "\n*...and more*"
            : list.join("\n");
        await interaction.reply({
          content: `### ${E_ANNO} **Upcoming Queue**\n${text}`,
          flags: [64],
        });
        return;
      }

      if (value === "clear") {
        player.clear(guildId);
        return await interaction.reply({
          content: "*Registry wiped. Queue is now clear.*",
          flags: [64],
        });
      }

      if (value === "skip") {
        const state = player.queues.get(guildId);
        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_NEXT =
          guildEmojis.find((e) => e.name === "blue_arrow_right")?.toString() ||
          "⏭️";

        if (state && state.queue.length === 0 && state.repeatMode === "off") {
          return await interaction.reply({
            content: `### ${E_NEXT} **Manual Bypass: Denied**\n> *No secondary target found in queue.*`,
            flags: [64],
          });
        }
        player.skip(guildId);
        await interaction.update({ components: [] }).catch(() => {});
        return await interaction.followUp({
          content: `### ${E_NEXT} **Target bypassed. Advancing to next track.**`,
          flags: [64],
        });
      }

      if (value === "stop") {
        player.stop(guildId);
        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_STOP =
          guildEmojis.find((e) => e.name === "ping_red")?.toString() || "⏹️";

        await interaction.update({ components: [] }).catch(() => {});
        return await interaction.followUp({
          content: `### ${E_STOP} **Operation decommissioned. Disconnecting.**`,
          flags: [64],
        });
      }
    }

    if (interaction.customId === "sync_emojis") {
      return await emojiHandler.syncMissingEmojis(interaction);
    }
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED-REJECTION]", reason?.message || reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT-EXCEPTION]", error.message);
  if (
    error.code === "InteractionNotReplied" ||
    error.code === "InteractionAlreadyReplied"
  ) {
    return;
  }
});

client.login(config.botToken);
