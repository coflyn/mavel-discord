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

const settingsPath = path.join(__dirname, "../database/settings.json");
const cooldowns = new Map();
const COOLDOWN_TIME = 60000;
const MAX_COMMANDS_PER_WINDOW = 2;

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    try {
      // 1. Autocomplete
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

      // 2. Context Menus
      if (interaction.isMessageContextMenuCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) return await cmd.execute(interaction, client);
      }

      // 3. Select Menus
      if (interaction.isStringSelectMenu()) {
        const { customId, values, user } = interaction;

        if (customId.startsWith("conv_pick_")) {
          return await converterHandler(interaction);
        }

        if (customId.startsWith("music_select")) {
          const authorId = customId.split("_").pop();
          if (user.id !== authorId)
            return interaction.reply({
              content: "*Selection menu is not for you.*",
              flags: [MessageFlags.Ephemeral],
            });

          const cached = musicCache.get(values[0]);
          if (!cached)
            return interaction.reply({
              content: "*Cache expired or bot restarted. Please search again.*",
              flags: [MessageFlags.Ephemeral],
            });

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
            return interaction.reply({
              content: "*Cache expired. Search again.*",
              flags: [MessageFlags.Ephemeral],
            });

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
              content: `${E_PC} *Fetching intelligence report from lyrics database...*`,
              flags: [MessageFlags.Ephemeral],
            });
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
              return interaction.reply({
                content: `### ${E_DIAMOND} **Playback Queue: Empty**`,
                flags: [MessageFlags.Ephemeral],
              });
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
              content: `### ${E_ANNO} **Upcoming Playback Queue**\n${list.join("\n").substring(0, 1900) || "*The queue is currently empty.*"}`,
              flags: [64],
            });
            return;
          }

          if (value === "clear") {
            await notifyControl("Clear");
            player.clear(guildId);
            const E_LEA = resolveEmoji(interaction.guild, "lea", "🗑️");
            return interaction.reply({
              content: `${E_LEA} **Queue Purged.**`,
              flags: [64],
            });
          }

          if (value === "playlist") {
            const names = Object.keys(getPlaylists(user.id));
            const E_THREE = resolveEmoji(interaction.guild, "three_dots", "📂");
            if (names.length === 0)
              return await interaction.reply({
                content: `### ${E_THREE} **No Saved Playlists Found**`,
                flags: [64],
              });
            const menu = new StringSelectMenuBuilder()
              .setCustomId("music_load_playlist")
              .setPlaceholder("Choose a playlist to load...")
              .addOptions(
                names.slice(0, 25).map((n) => ({ label: n, value: n })),
              );
            return await interaction.reply({
              components: [new ActionRowBuilder().addComponents(menu)],
              flags: [64],
            });
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
          return await interaction.editReply({
            content: `*Enqueued ${list.length} tracks.*`,
            components: [],
          });
        }
      }

      // 4. Buttons
      if (interaction.isButton()) {
        if (interaction.customId === "sync_emojis")
          return await syncMissingEmojis(interaction);
        return await downloaderHandler.handleDownloadCallback(interaction);
      }

      // 5. Chat Commands
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const userId = interaction.user.id;

        // Logging
        advanceLog(client, {
          type: "command",
          title: "Command Execution",
          activity: `/${commandName}`,
          message: `/${commandName} in ${interaction.guild?.name || "DMs"}`,
          user: `${interaction.user.tag}`,
        });

        const command = client.commands.get(commandName);
        if (command) await command.execute(interaction, client);
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
    }
  },
};
