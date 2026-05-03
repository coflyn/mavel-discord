const {
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const config = require("../config");
const fs = require("fs");
const path = require("path");
const { advanceLog } = require("../utils/logger");
const { getPlaylists } = require("../utils/playlist-helper");
const {
  player,
  musicHandler,
  searchCache: musicCache,
} = require("../handlers/music");
const { findLyrics } = require("../handlers/music/lyrics");
const { searchCache: globalSearchCache } = require("../handlers/search");
const searchHandler = require("../handlers/search");
const downloaderHandler = require("../handlers/downloader");
const converterHandler = require("../handlers/tools/converter");
const { syncMissingEmojis } = require("../handlers/tools/emoji");
const { resolveEmoji } = require("../utils/emoji-helper");

const settingsPath = path.join(__dirname, "../database/settings.json");
let settingsCache = null;
let lastSettingsRead = 0;
const SETTINGS_REFRESH_INTERVAL = 10000;

const cooldowns = new Map();
const COOLDOWN_TIME = 60000;
const MAX_COMMANDS_PER_WINDOW = 2;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cooldowns.entries()) {
    if (typeof value === "object" && !value.start) {
      let hasRecent = false;
      for (const cmd in value) {
        if (now - value[cmd] < 3600000) {
          hasRecent = true;
          break;
        }
      }
      if (!hasRecent) cooldowns.delete(key);
    } else if (value.start && now - value.start > COOLDOWN_TIME) {
      cooldowns.delete(key);
    }
  }
}, 600000);

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    try {
      const now = Date.now();
      if (
        !settingsCache ||
        now - lastSettingsRead > SETTINGS_REFRESH_INTERVAL
      ) {
        if (fs.existsSync(settingsPath)) {
          settingsCache = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          lastSettingsRead = now;
        }
      }

      if (settingsCache?.isHibernating) {
        const isWakeup =
          interaction.isChatInputCommand?.() &&
          interaction.commandName === "wakeup";
        const isAutocomplete = interaction.isAutocomplete?.();
        if (!isWakeup && !isAutocomplete) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({
                content:
                  "💤 *MaveL is currently in sleep mode. Use `/wakeup` to wake the bot.*",
                flags: [MessageFlags.Ephemeral],
              })
              .catch(() => {});
            setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
          }
          return;
        }
      }
    } catch (e) {}

    try {

      if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === "playlist") {
          const lists = getPlaylists(interaction.user.id);
          const focusedValue = interaction.options.getFocused().toLowerCase();
          const choices = Object.keys(lists).filter((n) =>
            n.toLowerCase().includes(focusedValue),
          );
          await interaction
            .respond(
              choices
                .slice(0, 25)
                .map((choice) => ({ name: choice, value: choice })),
            )
            .catch(() => {});
        }
        return;
      }

      if (interaction.isMessageContextMenuCommand()) {
        let commandName = interaction.commandName;
        if (commandName === "Convert Media") commandName = "convert";
        if (commandName === "Inspect Media") commandName = "inspect";
        if (commandName === "Translate Text") commandName = "app_translate";
        if (commandName === "Extract Text (OCR)") commandName = "app_ocr";
        if (commandName === "Format as Code") commandName = "app_format";
        if (commandName === "Mock Message") commandName = "app_mock";
        if (commandName === "Trace Anime") commandName = "trace";
        if (commandName === "Trace Movie") commandName = "trace";

        const cmd = client.commands.get(commandName);
        if (cmd) return await cmd.execute(interaction, client);
      }

      if (
        interaction.isButton() ||
        interaction.isUserSelectMenu() ||
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId &&
          (interaction.customId.startsWith("ticket_") ||
            interaction.customId.startsWith("room_"))
        ) {
          const roomHandler = require("../handlers/tools/room-handler");
          await roomHandler(interaction);
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        const { customId, values, user } = interaction;

        if (customId.startsWith("conv_pick_")) {
          return await converterHandler(interaction);
        }

        if (customId.startsWith("music_select")) {
          const authorId = customId.split("_").pop();
          if (user.id !== authorId)
            return interaction
              .reply({
                content: "*Selection menu is not for you.*",
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  10000,
                ),
              );

          const cached = musicCache.get(values[0]);
          if (!cached)
            return interaction
              .reply({
                content:
                  "*Cache expired or bot restarted. Please search again.*",
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  10000,
                ),
              );

          await interaction
            .update({ content: `*Loading: ${cached.title}*`, components: [] })
            .catch(() => {});
          return await musicHandler(interaction, {
            url: cached.url,
            title: cached.title,
          });
        }

        if (customId.startsWith("search_select")) {
          const cached = globalSearchCache.get(values[0]);
          if (!cached)
            return interaction
              .reply({
                content: "*Cache expired. Search again.*",
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  10000,
                ),
              );

          const typeSelection = customId.split("_").pop();
          const type = ["ytm", "bc", "spot"].includes(typeSelection)
            ? "mp3"
            : "mp4";
          const title = cached.title
            ? `${cached.uploader ? cached.uploader + " - " : ""}${cached.title}`
            : "Title";

          await interaction
            .update({ content: `*Processing selection...*`, components: [] })
            .catch(() => {});
          return await downloaderHandler(interaction, {
            manualUrl: cached.url,
            manualType: type,
            manualTitle: title,
          });
        }

        if (customId === "music_control_hub") {
          const value = values[0];
          const guildId = interaction.guild.id;
          const { resolveEmoji } = require("../utils/emoji-helper");

          const notifyControl = async (action) => {
            const state = player.queues.get(guildId);
            if (state?.current && state.current.requestedBy === user.id) return;
            const E_WARN = resolveEmoji(interaction.guild, "ping_red", "🔴");
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
            const E_PC = resolveEmoji(interaction.guild, "pc", "📡");
            const statusMsg = await interaction.followUp({
              content: `${E_PC} *Searching for song lyrics...*`,
              flags: [MessageFlags.Ephemeral],
            });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 120000);
            const state = player.queues.get(guildId);
            if (!state || !state.current)
              return await interaction.webhook.editMessage(statusMsg.id, {
                content: "*No active stream found.*",
              });
            const lyrics = await findLyrics(state.current.title);
            const E_BOOK = resolveEmoji(interaction.guild, "book", "📋");
            if (!lyrics || lyrics.includes("Could not find lyrics"))
              return await interaction.webhook.editMessage(statusMsg.id, {
                content: `### ${E_BOOK} **Lyrics Search: Failed**`,
              });
            await interaction.webhook.editMessage(statusMsg.id, {
              content: `### ${E_BOOK} **Lyrics: ${state.current.title}**\n\n${lyrics.substring(0, 1900)}`,
            });
            return;
          }

          if (value === "pause") {
            const state = player.queues.get(guildId);
            if (!state) return;
            const isPaused = state.player.state.status === "paused";
            await notifyControl(isPaused ? "Resume" : "Pause");
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
            const E_DIAMOND = resolveEmoji(interaction.guild, "diamond", "🔀");
            if (state.queue.length === 0)
              return interaction
                .reply({
                  content: `### ${E_DIAMOND} **Your list is currently empty**`,
                  flags: [MessageFlags.Ephemeral],
                })
                .then(() =>
                  setTimeout(
                    () => interaction.deleteReply().catch(() => {}),
                    10000,
                  ),
                );
            const newMode = state.shuffle ? "off" : "on";
            await notifyControl(`Shuffle ${newMode.toUpperCase()}`);
            player.toggleShuffle(guildId, newMode);
            return await interaction
              .update({
                embeds: [player.getNowPlayingEmbed(guildId)],
                components: [player.getPlaybackComponents(guildId)],
              })
              .catch(() => {});
          }

          if (value === "repeat") {
            const state = player.queues.get(guildId);
            if (!state) return;
            const cycle = { off: "one", one: "all", all: "off" };
            const nextMode = cycle[state.repeatMode || "off"];
            await notifyControl(`Repeat ${nextMode.toUpperCase()}`);
            player.setRepeat(guildId, nextMode);
            return await interaction
              .update({
                embeds: [player.getNowPlayingEmbed(guildId)],
                components: [player.getPlaybackComponents(guildId)],
              })
              .catch(() => {});
          }

          if (value === "queue") {
            const list = player.getQueueList(guildId);
            const E_ANNO = resolveEmoji(interaction.guild, "anno", "📜");
            await interaction.reply({
              content: `### ${E_ANNO} **Upcoming Songs**\n${list.join("\n").substring(0, 1900) || "*The list is currently empty.*"}`,
              flags: [64],
            });
            return setTimeout(
              () => interaction.deleteReply().catch(() => {}),
              30000,
            );
          }

          if (value === "clear") {
            await notifyControl("Clear");
            player.clear(guildId);
            const E_LEA = resolveEmoji(interaction.guild, "lea", "🗑️");
            await interaction.reply({
              content: `${E_LEA} **List cleared.**`,
              flags: [64],
            });
            return setTimeout(
              () => interaction.deleteReply().catch(() => {}),
              15000,
            );
          }

          if (value === "playlist") {
            const names = Object.keys(getPlaylists(user.id));
            const E_THREE = resolveEmoji(interaction.guild, "three_dots", "📂");
            if (names.length === 0) {
              await interaction.reply({
                content: `### ${E_THREE} **No Saved Playlists Found**`,
                flags: [64],
              });
              return setTimeout(
                () => interaction.deleteReply().catch(() => {}),
                15000,
              );
            }
            const menu = new StringSelectMenuBuilder()
              .setCustomId("music_load_playlist")
              .setPlaceholder("Choose a playlist to load...")
              .addOptions(
                names.slice(0, 25).map((n) => ({ label: n, value: n })),
              );
            await interaction.reply({
              components: [new ActionRowBuilder().addComponents(menu)],
              flags: [64],
            });
            return setTimeout(
              () => interaction.deleteReply().catch(() => {}),
              60000,
            );
          }

          if (value === "skip") {
            await notifyControl("Skip");
            player.skip(guildId);
            return interaction.update({ components: [] }).catch(() => {});
          }
          if (value === "stop") {
            await notifyControl("Stop");
            player.stop(guildId);
            return interaction.update({ components: [] }).catch(() => {});
          }
        }

        if (customId === "music_load_playlist") {
          const list = getPlaylists(user.id)[values[0].toLowerCase()];
          await interaction.deferUpdate();
          await player.playBatch(interaction, list);
          await interaction.editReply({
            content: `*Enqueued ${list.length} tracks.*`,
            components: [],
          });
          return setTimeout(
            () => interaction.deleteReply().catch(() => {}),
            15000,
          );
        }
      }

      if (
        interaction.isButton() ||
        interaction.isUserSelectMenu() ||
        interaction.isStringSelectMenu()
      ) {
        if (interaction.customId === "sync_emojis")
          return await syncMissingEmojis(interaction);

        if (interaction.isButton()) {
          return await downloaderHandler.handleDownloadCallback(interaction);
        }
      }

      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const userId = interaction.user.id;

        if (!interaction.guildId) {
          const allowedDmCommands = ["delete"];
          if (!allowedDmCommands.includes(commandName)) {
            let serverInvite = "";
            try {
              const mainGuild =
                client.guilds.cache.get(config.guildId) ||
                client.guilds.cache.first();
              if (mainGuild) {
                const channels = await mainGuild.channels.fetch();
                const inviteChannel =
                  channels.find((c) => c.type === ChannelType.GuildText) ||
                  mainGuild.systemChannel;
                if (inviteChannel) {
                  const invite = await inviteChannel
                    .createInvite({ maxAge: 0, maxUses: 0 })
                    .catch(() => null);
                  if (invite) serverInvite = invite.url;
                }
              }
            } catch (e) {
              console.error("[DM-INVITE-GEN] Error:", e.message);
            }

            const LEA = resolveEmoji(null, "lea", "🛰️");
            const ARROW = resolveEmoji(null, "arrow", "»");
            const ANNO = resolveEmoji(null, "anno", "📢");

            const embed = new EmbedBuilder()
              .setColor("#d63031")
              .setAuthor({
                name: "MaveL System Notice",
                iconURL: client.user.displayAvatarURL(),
              })
              .setTitle(`${LEA} **System Notice**`)
              .setDescription(
                `### **Commands Disabled in DMs**\n` +
                  `*To maintain stability and performance, MaveL commands are restricted to **Official Server Channels**.*\n\n` +
                  `**${ANNO} Why is this restricted?**\n` +
                  `${ARROW} *Stable media processing*\n` +
                  `${ARROW} *Reliable download speeds*\n` +
                  `${ARROW} *Official support access*\n\n` +
                  `Please use MaveL within our **[Official Discord Server](${serverInvite})** to access all features and tools.`,
              )
              .setFooter({ text: "MaveL Security System" })
              .setTimestamp();

            return interaction
              .reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  60000,
                ),
              );
          }
        }

        advanceLog(client, {
          type: "command",
          title: "Command Execution",
          activity: `/${commandName}`,
          message: `/${commandName} in ${interaction.guild?.name || "DMs"}`,
          user: `${interaction.user.tag}`,
        });

        const command = client.commands.get(commandName);
        if (command) {
          const isTicketRoom =
            interaction.channel.name &&
            (interaction.channel.name.startsWith("🔒") ||
              interaction.channel.name.startsWith("📁"));
          const isDownloaderChannel =
            !config.allowedChannelId ||
            interaction.channel.id === config.allowedChannelId ||
            isTicketRoom;
          const isMusicChannel =
            config.musicChannelId &&
            interaction.channel.id === config.musicChannelId;
          const isAdminChannel =
            config.adminChannelId &&
            interaction.channel.id === config.adminChannelId;
          const PING_RED = resolveEmoji(interaction.guild, "ping_red", "🔴");
          const NOTIF = resolveEmoji(interaction.guild, "notif", "🔔");
          const TIME = resolveEmoji(interaction.guild, "time", "⌛");

          if (command.category === "music") {
            if (!isMusicChannel && !isAdminChannel) {
              return interaction
                .reply({
                  content: `### ${PING_RED} **Wrong Channel**\n*Music commands only work in <#${config.musicChannelId}>.*`,
                  flags: [MessageFlags.Ephemeral],
                })
                .then(() =>
                  setTimeout(
                    () => interaction.deleteReply().catch(() => {}),
                    10000,
                  ),
                );
            }
          }

          if (
            command.category === "downloader" ||
            command.category === "search"
          ) {
            if (!isDownloaderChannel && !isAdminChannel) {
              return interaction
                .reply({
                  content: `### ${PING_RED} **Wrong Channel**\n*Search and Download commands only work in <#${config.allowedChannelId}> or **Private Rooms**.*`,
                  flags: [MessageFlags.Ephemeral],
                })
                .then(() =>
                  setTimeout(
                    () => interaction.deleteReply().catch(() => {}),
                    10000,
                  ),
                );
            }
          }

          const now = Date.now();
          const globalKey = `${interaction.user.id}_global`;
          const globalData = cooldowns.get(globalKey) || {
            count: 0,
            start: now,
          };

          if (now - globalData.start > COOLDOWN_TIME) {
            globalData.count = 0;
            globalData.start = now;
          }

          if (globalData.count >= MAX_COMMANDS_PER_WINDOW) {
            const waitTime = Math.ceil(
              (COOLDOWN_TIME - (now - globalData.start)) / 1000,
            );
            return interaction
              .reply({
                content: `### ${PING_RED} **Rate Limit Reached**\n*MaveL only allows **${MAX_COMMANDS_PER_WINDOW} commands per minute** to maintain stability. Try again in **${waitTime}s**.*`,
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  10000,
                ),
              );
          }

          globalData.count++;
          cooldowns.set(globalKey, globalData);

          const categoryCooldowns = {
            downloader: 15000,
            search: 10000,
            music: 5000,
            tools: command.name === "ss" ? 30000 : 3000,
          };

          const cooldownAmount =
            command.cooldown || categoryCooldowns[command.category] || 3000;
          const userCooldowns = cooldowns.get(interaction.user.id) || {};
          const lastUsed = userCooldowns[command.name] || 0;

          if (now - lastUsed < cooldownAmount) {
            const timeLeft = (
              (cooldownAmount - (now - lastUsed)) /
              1000
            ).toFixed(1);
            return interaction
              .reply({
                content: `### ${TIME} **Cooldown Active**\n*Please wait **${timeLeft}s** before using \`/${command.name}\` again to keep MaveL stable.*`,
                flags: [MessageFlags.Ephemeral],
              })
              .then(() =>
                setTimeout(
                  () => interaction.deleteReply().catch(() => {}),
                  5000,
                ),
              );
          }

          userCooldowns[command.name] = now;
          cooldowns.set(interaction.user.id, userCooldowns);

          await command.execute(interaction, client);
        }
      }
    } catch (err) {
      console.error("[INTERACTION-FATAL]", err);
      if (interaction.replied || interaction.deferred)
        await interaction
          .followUp({ content: `*System Error: ${err.message}*`, flags: [64] })
          .catch(() => {});
      else
        await interaction
          .reply({ content: `*System Error: ${err.message}*`, flags: [64] })
          .catch(() => {});
      setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
    }
  },
};
