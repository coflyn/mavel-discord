const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  ActivityType,
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
    GatewayIntentBits.GuildMessageReactions,
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
const harvestHandler = require("./handlers/tools/harvest");
const converterHandler = require("./handlers/tools/converter");
const { advanceLog } = require("./utils/logger");
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

client.once("clientReady", async () => {
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
      title: "MaveL Status",
      color: cookieCheck.color,
      message: `*System updated. Cookies: ${cookieCheck.status}${cookieCheck.exists ? ` (${cookieCheck.daysOld} days old)` : ""}.*`,
    });
  }

  const activities = [
    { name: "Music & Downloads", type: 3 },
    { name: "Your requests", type: 3 },
    { name: "Connected servers", type: 3 },
    { name: "Active users", type: 3 },
    { name: "/help | @MaveL", type: 3 },
  ];
  let i = 0;
  const updateStatus = () => {
    if (client.statusOverride) return;
    const activity = activities[i % activities.length];
    let name = activity.name;

    if (name === "Active users") {
      const users = client.users.cache.size || 0;
      name = `${users} users`;
    } else if (name === "Connected servers") {
      const guilds = client.guilds.cache.size || 0;
      name = `${guilds} servers`;
    }

    client.user.setPresence({
      activities: [{ name, type: activity.type || ActivityType.Watching }],
      status: "online",
    });
    i++;
  };

  client.setTempStatus = (
    name,
    type = ActivityType.Watching,
    duration = 15000,
  ) => {
    client.statusOverride = true;
    client.user.setPresence({
      activities: [{ name, type }],
      status: "online",
    });
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
      .setTitle(`${ANNO} **MaveL is Ready!**`)
      .setImage(botBanner)
      .setDescription(
        `### ${LINK} **Successfully Joined!**\n` +
          `*MaveL is now connected to **${guild.name}**. To start using all features, please follow these steps:*\n\n` +
          `${ARROW} **Step 1:** Run **\`/emoji needs\`** to sync custom emojis.\n` +
          `${ARROW} **Step 2:** Run **\`/setup\`** to configure the bot.\n` +
          `${ARROW} **Step 3:** Run **\`/cookies\`** to enable premium downloads.\n\n` +
          `*Status: Waiting for Admin setup...*`,
      )
      .setFooter({ text: "MaveL System" })
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
          `[SYSTEM] New server detected. Leaving old server ${oldGuild.name} in 60s.`,
        );
        setTimeout(async () => {
          try {
            await oldGuild.leave();
            console.log(`[SYSTEM] Left server ${oldGuild.name}.`);
          } catch (e) {
            console.error(
              `[ERROR] Failed to leave server ${oldGuild.name}:`,
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
client.on("voiceStateUpdate", async (oldState, newState) => {
  const guild = oldState.guild;
  const user = oldState.member.user;

  if (!user.bot) {
    if (!oldState.channelId && newState.channelId) {
      advanceLog(client, {
        type: "voice",
        title: "Voice Joined",
        activity: "User Connected",
        message: `${user} joined voice channel: **${newState.channel.name}**`,
        user: `${user.tag}`,
        guild: guild.name,
      });
    } else if (oldState.channelId && !newState.channelId) {
      advanceLog(client, {
        type: "voice",
        title: "Voice Left",
        activity: "User Disconnected",
        message: `${user} left voice channel: **${oldState.channel.name}**`,
        user: `${user.tag}`,
        guild: guild.name,
      });
    } else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      advanceLog(client, {
        type: "voice",
        title: "Voice Moved",
        activity: "Switching Channels",
        message: `${user} moved from **${oldState.channel.name}** to **${newState.channel.name}**`,
        user: `${user.tag}`,
        guild: guild.name,
      });
    }
  }

  const guildId = guild.id;
  const state = player.queues.get(guildId);
  if (!state) return;

  const me = guild.members.me;
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
      }, 2000);
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

  if (
    interaction.isMessageContextMenuCommand() &&
    interaction.commandName === "Convert Media"
  ) {
    return await converterHandler(interaction);
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("conv_pick_")
  ) {
    return await converterHandler(interaction);
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const userId = interaction.user.id;

    advanceLog(client, {
      type: "command",
      title: "Command Execution",
      activity: `/${commandName}`,
      message: `User triggered a slash command in #${interaction.channel.name}`,
      user: `${interaction.user.tag} (${interaction.user.id})`,
      guild: interaction.guild ? `${interaction.guild.name}` : "DMs",
      extra:
        interaction.options.data.length > 0
          ? interaction.options.data
              .map((o) => `${o.name}: ${o.value}`)
              .join("\n")
          : "No arguments",
    });

    if (commandName === "delete") {
      await interaction.deferReply({ flags: [64] });
      const count = interaction.options.getInteger("count") || 5;
      const limit = Math.min(count, 100);

      if (!interaction.guild) {
        try {
          const messages = await interaction.channel.messages.fetch({
            limit: 100,
          });
          const botMessages = messages.filter(
            (m) => m.author.id === client.user.id,
          );
          const toDelete = Array.from(botMessages.values()).slice(0, limit);

          let deleted = 0;
          for (const msg of toDelete) {
            await msg.delete().catch(() => {});
            deleted++;
          }

          const getE = (name, fallback) =>
            interaction.client.emojis.cache
              .find((e) => e.name === name)
              ?.toString() || fallback;
          const E_FIRE = getE("purple_fire", "🔥");

          const res = await interaction.editReply({
            content: `### ${E_FIRE} **DM Cleanup Finished**\n*Identified and removed **${deleted}** bot messages from this conversation.*`,
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
          return res;
        } catch (err) {
          return await interaction.editReply({
            content: `### ❌ **Cleanup Failed**\n*Error: ${err.message}*`,
          });
        }
      } else {
        if (
          !interaction.member.permissions.has(
            PermissionFlagsBits.ManageMessages,
          )
        ) {
          return await interaction.editReply({
            content:
              "*Error: Permission Denied. You need 'Manage Messages' permission to use this.*",
          });
        }

        try {
          const deletedMessages = await interaction.channel.bulkDelete(
            limit,
            true,
          );
          const getE = (name, fallback) =>
            interaction.client.emojis.cache
              .find((e) => e.name === name)
              ?.toString() || fallback;
          const E_FIRE = getE("purple_fire", "🔥");

          const res = await interaction.editReply({
            content: `### ${E_FIRE} **Cleanup Finished**\n*Removed **${deletedMessages.size}** messages from this channel.*`,
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
          return res;
        } catch (err) {
          return await interaction.editReply({
            content: `### ❌ **Cleanup Failed**\n*Error: ${err.message}*`,
          });
        }
      }
    }

    if (!interaction.guild) {
      let inviteUrl = "https://discord.com";
      try {
        const homeGuild =
          interaction.client.guilds.cache.get(config.guildId) ||
          interaction.client.guilds.cache.first();
        if (homeGuild) {
          const channels =
            homeGuild.channels.cache.size > 0
              ? homeGuild.channels.cache
              : await homeGuild.channels.fetch().catch(() => null);

          if (channels) {
            const channel = channels.find(
              (c) =>
                c.type === ChannelType.GuildText &&
                c
                  .permissionsFor(homeGuild.members.me)
                  .has(PermissionFlagsBits.CreateInstantInvite),
            );
            if (channel) {
              const invite = await channel
                .createInvite({ maxAge: 0 })
                .catch(() => null);
              if (invite) inviteUrl = invite.url;
            }
          }
        }
      } catch (e) {
        // Silent
      }

      const getE = (name, fallback) =>
        interaction.client.emojis.cache
          .find((e) => e.name === name)
          ?.toString() || fallback;
      const E_WARN = getE("ping_red", "⚠️");
      const E_LINK = getE("pc", "🔗");

      const dmEmbed = new EmbedBuilder()
        .setColor("#ff4757")
        .setTitle(`${E_WARN} Not Available in DMs`)
        .setDescription(
          "### **Access Denied**\n" +
            "> *Sorry, my features only work inside a Discord Server. You cannot use commands in Direct Messages.*",
        )
        .addFields({
          name: `${E_LINK} **Join Our Server**`,
          value: `[Click here to join the Main Hub](${inviteUrl})`,
        })
        .setFooter({ text: "Please use MaveL inside a Server" });

      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ embeds: [dmEmbed], flags: [64] })
          .catch(() => {});
        setTimeout(() => {
          interaction.deleteReply().catch(() => {});
        }, 15000);
      }
      return;
    }

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
      "harvest",
    ].includes(commandName);

    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
      : {};
    const isAdmin = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator,
    );

    if (settings.isHibernating && !isAdmin && commandName !== "wakeup") {
      return interaction.reply({
        content: "*System is currently in Sleep Mode. Only admins can use it.*",
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
        content: "*Admin permission needed to use this command.*",
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
    if (commandName === "harvest") {
      return await harvestHandler(interaction);
    }
    if (commandName === "convert") {
      return await converterHandler(interaction);
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
        content: `### ${E_NEXT} **Song skipped. Moving to next.**`,
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
        content: `### ${E_STOP} **Bot stopped.**`,
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
        content: `### ${E_PAUSE} **Music Paused.**`,
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
        content: `### ${E_RESUME} **Music Resumed.**`,
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
            `### ${E_FIRE} **Queue: Empty**\n> *No songs found in the queue.*`,
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
        .setDescription(`### ${E_ANNO} **Track List**\n` + list.join("\n"))
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
        content: `### ${E_REPEAT} **Repeat Mode: ${mode.toUpperCase()}**`,
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
        content: `### ${E_CLEAR} **Queue Cleared.**`,
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
        .setTitle("*Invite MaveL to another Server*")
        .setImage(botBanner)
        .setDescription(
          `### ${LINK} **Connection Success**\n` +
            `*To add MaveL to a different server, use the invite link below. This will allow you to use all downloader and music features in that server.*\n\n` +
            `${PC} [Add MaveL to another server](${inviteUrl})\n\n` +
            `**Setup Checklist:**\n` +
            `${ARROW} *Run **\`/emoji needs\`** to sync custom emojis.*\n` +
            `${ARROW} *Run **\`/setup\`** to get everything ready.*\n` +
            `${ARROW} *Run **\`/cookies\`** for premium downloads.*`,
        )
        .setFooter({ text: "MaveL System" });

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
        : "Title";
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
      const user = interaction.user;

      const notifyControl = async (action) => {
        const state = player.queues.get(guildId);
        if (state?.current && state.current.requestedBy === user.id) return;

        const E_WARN =
          interaction.guild.emojis.cache
            .find((e) => e.name === "ping_red")
            ?.toString() || "🔴";
        const msg = await interaction.channel
          .send({
            content: `${E_WARN} **[STREAM CONTROL]** ${user} has modified the playback: **[${action.toUpperCase()}]**`,
          })
          .catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
      };

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
            content: `### 📋 **Lyrics Search: Failed**\n> *No lyrics found for track: \`${query}\`*`,
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
        if (isPaused) {
          await notifyControl("Resume");
          player.resume(guildId);
        } else {
          await notifyControl("Pause");
          player.pause(guildId);
        }

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
          const deniedMsg = await interaction.reply({
            content: `### ${E_SHUFFLE} **Shuffle: Queue is empty**\n> *No more songs found in the queue.*`,
            flags: [64],
            fetchReply: true,
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
          return;
        }
        const newMode = state.shuffle ? "off" : "on";
        await notifyControl(`Shuffle ${newMode.toUpperCase()}`);
        player.toggleShuffle(guildId, newMode);

        await interaction
          .update({
            embeds: [player.getNowPlayingEmbed(guildId)],
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});
        const shuffleMsg = await interaction.followUp({
          content: `### ${E_SHUFFLE} **Shuffle: ${newMode.toUpperCase()}**`,
          flags: [64],
        });
        setTimeout(
          () => interaction.deleteReply(shuffleMsg.id).catch(() => {}),
          5000,
        );
      }

      if (value === "repeat") {
        const state = player.queues.get(guildId);
        if (!state) return;

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_REPEAT =
          guildEmojis.find((e) => e.name === "rocket")?.toString() || "🔁";

        const cycle = { off: "one", one: "all", all: "off" };
        const nextMode = cycle[state.repeatMode || "off"];
        await notifyControl(`Repeat ${nextMode.toUpperCase()}`);
        player.setRepeat(guildId, nextMode);

        await interaction
          .update({
            embeds: [player.getNowPlayingEmbed(guildId)],
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});
        const repeatMsg = await interaction.followUp({
          content: `### ${E_REPEAT} **Repeat: ${nextMode.toUpperCase()}**`,
          flags: [64],
        });
        setTimeout(
          () => interaction.deleteReply(repeatMsg.id).catch(() => {}),
          5000,
        );
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
        const queueReply = await interaction.reply({
          content: `### ${E_ANNO} **Upcoming Queue**\n${text}`,
          flags: [64],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
        return;
      }

      if (value === "clear") {
        await notifyControl("Clear Queue");
        player.clear(guildId);
        await interaction.reply({
          content: "*Queue is now clear.*",
          flags: [64],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }

      if (value === "playlist") {
        const playlists = getPlaylists(user.id);
        const names = Object.keys(playlists);

        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_FIRE =
          guildEmojis.find((e) => e.name === "purple_fire")?.toString() || "🔥";

        await interaction
          .update({
            components: [player.getPlaybackComponents(guildId)],
          })
          .catch(() => {});

        if (names.length === 0) {
          return await interaction.followUp({
            content: `### ${E_FIRE} **No Playlists Found**\n> *Create one first using \`/playlist save\`*`,
            flags: [64],
          });
        }

        const E_ARROW = guildEmojis.find((e) => e.name === "arrow") || "▶️";

        const menu = new StringSelectMenuBuilder()
          .setCustomId("music_load_playlist")
          .setPlaceholder("Select a playlist to load...")
          .addOptions(
            names.slice(0, 25).map((n) => ({
              label: n.charAt(0).toUpperCase() + n.slice(1),
              description: `${playlists[n].length} tracks`,
              value: n,
              emoji: E_ARROW.id || E_ARROW,
            })),
          );

        const row = new ActionRowBuilder().addComponents(menu);

        return await interaction.followUp({
          content: `### ${E_FIRE} **Select a Playlist to Load**`,
          components: [row],
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
          const skipDenied = await interaction.reply({
            content: `### ${E_NEXT} **Skip Request: Denied**\n> *No more songs in the queue.*`,
            flags: [64],
            fetchReply: true,
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
          return;
        }
        await notifyControl("Skip");
        player.skip(guildId);
        await interaction.update({ components: [] }).catch(() => {});
        const skipMsg = await interaction.followUp({
          content: `### ${E_NEXT} **Song skipped. Moving to next track.**`,
          flags: [64],
        });
        setTimeout(
          () => interaction.deleteReply(skipMsg.id).catch(() => {}),
          5000,
        );
      }

      if (value === "stop") {
        await notifyControl("Stop");
        player.stop(guildId);
        const guildEmojis = await interaction.guild.emojis.fetch();
        const E_STOP =
          guildEmojis.find((e) => e.name === "ping_red")?.toString() || "⏹️";

        await interaction.update({ components: [] }).catch(() => {});
        const stopMsg = await interaction.followUp({
          content: `### ${E_STOP} **Bot stopped. Disconnecting.**`,
          flags: [64],
        });
        setTimeout(() => stopMsg.delete().catch(() => {}), 5000);
      }
    }

    if (interaction.customId === "music_load_playlist") {
      const name = interaction.values[0];
      const userId = interaction.user.id;
      const playlists = getPlaylists(userId);
      const list = playlists[name.toLowerCase()];

      if (!list) {
        return await interaction.reply({
          content: `*Playlist '${name}' not found.*`,
          flags: [64],
        });
      }

      await interaction.deferUpdate();
      try {
        await player.playBatch(interaction, list);
        await interaction.editReply({
          content: `*Enqueued ${list.length} tracks from playlist '${name}'.*`,
          components: [],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      } catch (e) {
        await interaction.editReply({
          content: `*Error: ${e.message}*`,
          components: [],
        });
      }
      return;
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

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      return;
    }
  }

  const { message, emoji } = reaction;
  const isCheck =
    ["check", "verified", "blue_check"].includes(emoji.name?.toLowerCase()) ||
    emoji.name === "✅" ||
    emoji.name === "☑️";
  if (!isCheck) return;

  if (message.author.id !== client.user.id) return;

  const embed = message.embeds[0];
  if (
    !embed ||
    !(
      embed.title?.includes("Media Ready") ||
      embed.title?.includes("Media Link Ready")
    )
  )
    return;

  const desc = embed.description || "";
  const linkMatch = desc.match(/\[Original Link\]\(<([^>]+)>\)/);
  if (!linkMatch) return;

  const url = linkMatch[1];
  const titleField = embed.fields?.find((f) => f.name.includes("Title"));
  const cleanTitle =
    titleField?.value.replace(/\*/g, "").substring(0, 100) || "Media";

  try {
    const guildEmojis = message.guild
      ? await message.guild.emojis.fetch().catch(() => null)
      : null;
    const getE = (name, fallback) =>
      guildEmojis?.find((e) => e.name === name)?.toString() || fallback;

    const E_ANNO = getE("anno", "📑");
    const E_ARROW = getE("arrow", "»");

    const dmEmbed = new EmbedBuilder()
      .setColor(embed.color || "#6c5ce7")
      .setAuthor({
        name: "MaveL Bookmark Service",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle(`${E_ANNO} **Content Bookmarked**`)
      .setThumbnail(embed.thumbnail?.url || embed.image?.url || null)
      .setDescription(
        `You bookmarked this media via reaction in **${message.guild?.name || "a server"}**.\n\n` +
          `${E_ARROW} **Title:** *${cleanTitle}*\n` +
          `${E_ARROW} **Source:** ${url}`,
      )
      .setFooter({ text: "MaveL", iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await user.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch (err) {
    // Silent
  }
});

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
  console.error("[UNHANDLED-REJECTION]", reason);
  advanceLog(client, {
    type: "error",
    title: "System Warning",
    activity: "Unhandled Promise Rejection",
    message:
      typeof reason === "string" ? reason : reason.message || "Unknown error",
    extra: reason.stack || "No stack trace available",
  });
});

client.login(config.botToken);
