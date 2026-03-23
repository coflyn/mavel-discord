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
} = require("discord.js");
const config = require("./config");
const fs = require("fs");
const path = require("path");

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
const { startTunnel } = require("./utils/tunnel-server");

client.on("clientReady", async () => {
  cleanupTemp();

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
  setInterval(() => {
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
  }, 60000);

  setInterval(() => {
    cleanupTemp();
    console.log("[SYSTEM] Periodic temp cleanup completed.");
  }, 10 * 60 * 1000);
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
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
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
      "server",
    ].includes(commandName);

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
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `*Error: ${e.message}*`,
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
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
      return await musicHandler(interaction, { title: query });
    }

    if (commandName === "skip") {
      player.skip(interaction.guild.id);
      await interaction.reply({
        content: "*Skipped current track.*",
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "stop") {
      player.stop(interaction.guild.id);
      await interaction.reply({
        content: "*Stopped and disconnected.*",
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "pause") {
      player.pause(interaction.guild.id);
      await interaction.reply({
        content: "*Paused.*",
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "resume") {
      player.resume(interaction.guild.id);
      await interaction.reply({
        content: "*Resumed.*",
        flags: [MessageFlags.Ephemeral],
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
      setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
      return;
    }

    if (commandName === "queue") {
      const list = player.getQueueList(interaction.guild.id);
      const NOTIF =
        interaction.guild.emojis.cache
          .find((e) => e.name === "notif")
          ?.toString() || "🔔";
      const FIRE =
        interaction.guild.emojis.cache
          .find((e) => e.name === "purple_fire")
          ?.toString() || "🔥";

      if (list.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor("#00008b")
          .setDescription(
            `### ${FIRE} **Queue is empty**\n> *Add some tracks to get started.*`,
          );

        await interaction.reply({
          embeds: [emptyEmbed],
          flags: [MessageFlags.Ephemeral],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }

      const queueEmbed = new EmbedBuilder()
        .setColor("#1e4d2b")
        .setAuthor({
          name: "MaveL Synchronized Queue",
          iconURL: client.user.displayAvatarURL(),
        })
        .setDescription(
          `### ${NOTIF} **Synchronized Queue**\n` + list.join("\n"),
        )
        .setFooter({ text: `MaveL | Total Tracks: ${list.length}` });

      await interaction.reply({
        embeds: [queueEmbed],
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 30000);
      return;
    }

    if (commandName === "shuffle") {
      const mode = interaction.options.getString("mode");
      player.toggleShuffle(interaction.guild.id, mode);
      await interaction.reply({
        content: `*Shuffle mode set to: ${mode.toUpperCase()}*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "repeat") {
      const mode = interaction.options.getString("mode");
      player.setRepeat(interaction.guild.id, mode);

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
        content: `*Repeat mode set to: ${mode.toUpperCase()}*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "clear") {
      player.clear(interaction.guild.id);
      await interaction.reply({
        content: "*Queue cleared.*",
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "remove") {
      const num = interaction.options.getInteger("number");
      const removed = player.remove(interaction.guild.id, num);
      if (!removed) {
        await interaction.reply({
          content: "*Track not found at that position.*",
          flags: [MessageFlags.Ephemeral],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }
      await interaction.reply({
        content: `*Removed: ${removed.title}*`,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
      return;
    }

    if (commandName === "skipto") {
      const num = interaction.options.getInteger("number");
      const success = player.skipto(interaction.guild.id, num);
      if (!success) {
        await interaction.reply({
          content: "*Track not found at that position.*",
          flags: [MessageFlags.Ephemeral],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }
      await interaction.reply({
        content: `*Skipped to track #${num}.*`,
        flags: [MessageFlags.Ephemeral],
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
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
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
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
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
            .setColor("#00008b")
            .setDescription(
              `### ${FIRE} **No Playlists**\n> *You haven't saved any playlists yet.*`,
            );

          await interaction.reply({
            embeds: [emptyEmbed],
            flags: [MessageFlags.Ephemeral],
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
          return;
        }

        const LEA =
          interaction.guild.emojis.cache
            .find((e) => e.name === "lea")
            ?.toString() || "✅";
        const ARROW =
          interaction.guild.emojis.cache
            .find((e) => e.name === "arrow")
            ?.toString() || ">";

        const listEmbed = new EmbedBuilder()
          .setColor("#00008b")
          .setDescription(
            `### ${LEA} **Saved Playlists**\n` +
              names.map((n) => `${ARROW} \`${n}\``).join("\n"),
          )
          .setFooter({ text: `MaveL | Total Playlists: ${names.length}` });

        await interaction.reply({
          embeds: [listEmbed],
          flags: [MessageFlags.Ephemeral],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
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
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
          return;
        }
        await interaction.reply({
          content: `*Playlist '${name}' deleted.*`,
          flags: [MessageFlags.Ephemeral],
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
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
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
          return;
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
          await player.playBatch(interaction, list);
          await interaction.editReply({
            content: `*Enqueued ${list.length} tracks from playlist '${name}'.*`,
          });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
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
      } else {
        await interaction.editReply({
          content: `*Lyrics for ${query}:*\n\n${lyrics}`,
        });
      }
      return;
    }

    if (["info", "icon", "banner", "server"].includes(commandName)) {
      return await infoHandler(interaction);
    }

    if (commandName === "emoji") {
      return await emojiHandler(interaction);
    }

    if (commandName === "setup") {
      return await setupHandler(interaction);
    }
  }

  if (interaction.isButton()) {
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
        const [rawUrl, rawTitle] = interaction.values[0].split("|");
        await interaction
          .update({
            content: `*Loading: ${rawTitle || "Track"}*`,
            components: [],
          })
          .catch(() => {});
        return await musicHandler(interaction, {
          url: rawUrl,
          title: rawTitle,
        });
      } catch (e) {
        console.error("[MUSIC-SELECT] Error:", e.message);
      }
    }

    if (interaction.customId.startsWith("search_select")) {
      const url = interaction.values[0];
      const subcommand = interaction.customId.split("_").pop();
      const type = ["ytm", "spot", "sc"].includes(subcommand) ? "mp3" : "mp4";

      try {
        await interaction
          .update({ content: `*Selected selection...*`, components: [] })
          .catch(() => {});

        return await downloaderHandler(interaction, {
          manualUrl: url,
          manualType: type,
        });
      } catch (e) {
        console.error("[SELECT-HANDLER] Error:", e.message);
      }
    }
  }
});

client.login(config.botToken);
