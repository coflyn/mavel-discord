const { getTempDir } = require("../../utils/filetools");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require("@discordjs/voice");
const {
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  getYtDlp,
  getDlpEnv,
  getCookiesArgs,
  getVpsArgs,
  getJsRuntimeArgs,
} = require("../../utils/dlp-helpers");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { REQUIRED_EMOJIS } = require("../../utils/emoji-registry");
const { advanceLog } = require("../../utils/logger");
const colors = require("../../utils/embed-colors");
const CACHE_DIR = path.join(getTempDir(), "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

class MusicPlayer {
  constructor() {
    this.queues = new Map();
  }
  getQueue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, {
        connection: null,
        player: createAudioPlayer(),
        queue: [],
        current: null,
        channel: null,
        idleTimer: null,
        aloneTimer: null,
        pauseTimer: null,
        repeatMode: "off",
        shuffle: false,
        isStarting: false,
        activeProcesses: [],
      });
    }
    return this.queues.get(guildId);
  }

  getEmoji(guild, name, fallback) {
    return resolveEmoji(guild, name, fallback);
  }

  async play(target, url, title = "Unknown Title") {
    const isInteraction =
      !!target.isChatInputCommand || !!target.isStringSelectMenu;
    const guildId = target.guild.id;
    const voiceChannel = target.member.voice.channel;
    const author = isInteraction ? target.user : target.author;

    if (!voiceChannel) {
      const msg = "*You must be in a voice channel first.*";
      if (isInteraction) {
        await target.reply({ content: msg, flags: [64] });
        setTimeout(() => target.deleteReply().catch(() => {}), 5000);
      } else {
        target.reply(msg);
      }
      return;
    }

    const state = this.getQueue(guildId);
    state.channel = target.channel;

    let realTitle = title || "Unknown Track";
    if (realTitle === "Unknown Track" || realTitle === "Unknown Title") {
      try {
        const ytProcess = spawn(getYtDlp(), [
          "-e",
          "--no-playlist",
          ...getCookiesArgs(),
          ...getVpsArgs(),
          url,
        ]);
        let out = "";
        ytProcess.stdout.on("data", (d) => (out += d));
        await new Promise((r) => ytProcess.on("close", r));
        if (out.trim()) realTitle = out.trim();
      } catch (e) {
        console.error("[MUSIC-PLAY] Title fetch error:", e.message);
      }
    }

    state.queue.push({ url, title: realTitle, requestedBy: author.id });

    if (!state.connection) {
      state.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: target.guild.id,
        adapterCreator: target.guild.voiceAdapterCreator,
      });

      state.connection.subscribe(state.player);

      state.connection.on(VoiceConnectionStatus.Disconnected, () => {
        this.stop(guildId);
      });

      state.player.on(AudioPlayerStatus.Idle, () => {
        this.playNext(guildId);
      });
    }

    if (
      state.player.state.status === AudioPlayerStatus.Idle &&
      !state.isStarting
    ) {
      state.isStarting = true;
      try {
        await this.playNext(guildId);
      } finally {
        state.isStarting = false;
      }
      if (isInteraction) {
        setTimeout(() => target.deleteReply().catch(() => {}), 2000);
      }
    } else {
      const msg = `*Queued: ${realTitle}*`;
      if (isInteraction) {
        if (target.replied || target.deferred)
          await target.followUp({ content: msg, flags: [64] });
        else await target.reply({ content: msg, flags: [64] });
        setTimeout(() => target.deleteReply().catch(() => {}), 3000);
      } else {
        target.reply(msg);
      }
    }
  }

  async playBatch(target, tracks) {
    const isInteraction = !!target.isChatInputCommand;
    const guildId = target.guild.id;
    const voiceChannel = target.member.voice.channel;
    const author = isInteraction ? target.user : target.author;

    if (!voiceChannel) throw new Error("No voice channel");

    const state = this.getQueue(guildId);
    state.channel = target.channel;

    for (const t of tracks) {
      state.queue.push({
        url: t.url,
        title: t.title || "Track",
        requestedBy: author.id,
      });
    }

    if (!state.connection) {
      state.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: target.guild.id,
        adapterCreator: target.guild.voiceAdapterCreator,
      });
      state.connection.subscribe(state.player);
      state.connection.on(VoiceConnectionStatus.Disconnected, () =>
        this.stop(guildId),
      );
      state.player.on(AudioPlayerStatus.Idle, () => this.playNext(guildId));
    }

    if (
      state.player.state.status === AudioPlayerStatus.Idle &&
      !state.isStarting
    ) {
      state.isStarting = true;
      try {
        await this.playNext(guildId);
      } finally {
        state.isStarting = false;
      }
    }
  }

  async playNext(guildId) {
    const state = this.getQueue(guildId);
    if (!state) return;

    if (state.lastNowPlayingMsg) {
      const endedEmbed = this.getNowPlayingEmbed(guildId, "Playback Ended");
      state.lastNowPlayingMsg
        .edit({
          embeds: endedEmbed ? [endedEmbed] : [],
          components: [],
        })
        .catch(() => {});
    }

    if (state.activeProcesses) {
      state.activeProcesses.forEach((p) => {
        try {
          p.kill();
        } catch (e) {}
      });
      state.activeProcesses = [];
    }

    if (state.current) {
      if (state.repeatMode === "one") {
        state.queue.unshift(state.current);
      } else if (state.repeatMode === "all") {
        state.queue.push(state.current);
      }
    }

    if (state.queue.length === 0) {
      state.current = null;
      if (state.idleTimer) clearTimeout(state.idleTimer);

      if (state.lastNowPlayingMsg) {
        state.lastNowPlayingMsg.edit({ components: [] }).catch(() => {});
      }

      console.log(
        `[MUSIC-IDLE] Queue finished for guild ${guildId}, starting 30s timer...`,
      );
      state.idleTimer = setTimeout(() => {
        const recheckState = this.queues.get(guildId);
        if (
          recheckState &&
          recheckState.queue.length === 0 &&
          recheckState.player.state.status === AudioPlayerStatus.Idle
        ) {
          this.stop(guildId);
          if (recheckState.channel) {
            recheckState.channel.client.user.setActivity("/help | MaveL", {
              type: ActivityType.Playing,
            });
          }
        }
      }, 30000);
      return;
    }

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    if (state.pauseTimer) {
      clearTimeout(state.pauseTimer);
      state.pauseTimer = null;
    }

    const trackIndex = state.shuffle
      ? Math.floor(Math.random() * state.queue.length)
      : 0;
    const track = state.queue.splice(trackIndex, 1)[0];
    state.current = track;

    try {
      const ytArgs = [
        "--buffer-size",
        "1M",
        "-j",
        "-f",
        "140/bestaudio[ext=m4a]/bestaudio/best",
        "--no-playlist",
        ...getJsRuntimeArgs(),
        ...getCookiesArgs(),
        ...getVpsArgs(),
        track.url,
      ];
      const ytProcess = spawn(getYtDlp(), ytArgs, { env: getDlpEnv() });

      let out = "";
      let err = "";
      ytProcess.stdout.on("data", (d) => (out += d));
      ytProcess.stderr.on("data", (d) => (err += d));
      await new Promise((r) => ytProcess.on("close", r));

      const lines = out.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("{"));
      if (!jsonLine) {
        if (state.channel) {
          const { resolveEmoji } = require("../../utils/emoji-helper");
          const E_WARN = resolveEmoji(state.channel.guild, "ping_red", "🔴");
          state.channel
            .send(
              `${E_WARN} **[AUDIO ERROR]** Failed to load track details. Skipping...`,
            )
            .catch(() => {});
        }
        throw new Error("No metadata JSON found in yt-dlp output");
      }
      const info = JSON.parse(jsonLine);
      
      const isLive = info.is_live || info.live_status === "is_live";
      const duration = info.duration || 0;
      if (isLive || duration > 3600) {
        if (state.channel) {
          const { resolveEmoji } = require("../../utils/emoji-helper");
          const E_WARN = resolveEmoji(state.channel.guild, "ping_red", "🔴");
          state.channel.send(`${E_WARN} **[BLOCKED]** **${info.title || "Track"}** is ${isLive ? "a Live Stream" : "longer than 1 hour"}.`).catch(() => {});
        }
        return this.playNext(guildId);
      }

      const finalTitle =
        track.title && track.title !== "videoplayback"
          ? track.title
          : info.title || "---";
      state.current = { ...info, ...track, title: finalTitle };
      const streamUrl = info.url;

      if (state.channel) {
        advanceLog(state.channel.client, {
          type: "music",
          title: "Music Stream Started",
          activity: "Playing Audio",
          message: `Now streaming: **${finalTitle}**`,
          user: `<@${track.requestedBy}>`,
          guild: state.channel.guild.name,
          extra: `URL: ${track.url}\nSource: ${info.extractor_key || "Unknown"}`,
        });
      }

      if (!streamUrl || !streamUrl.startsWith("http")) {
        console.error(`[MUSIC-DLP] Failed for: ${track.title}`);
        throw new Error("Could not fetch stream URL");
      }

      const trackId =
        track.id || Buffer.from(track.url).toString("base64").substring(0, 16);
      const cachePath = path.join(CACHE_DIR, `${trackId}.s16le`);
      let bufferingMsg = null;

      if (state.touchTimer) clearInterval(state.touchTimer);
      state.touchTimer = setInterval(() => {
        if (fs.existsSync(cachePath)) {
          const now = new Date();
          fs.utimesSync(cachePath, now, now);
        }
      }, 120000);

      if (state.channel) {
        if (state.repeatMode === "one" && state.lastNowPlayingMsg) {
          try {
            await state.lastNowPlayingMsg.edit({
              embeds: [
                this.getNowPlayingEmbed(
                  guildId,
                  fs.existsSync(cachePath)
                    ? "🚀 Instant Sync Active"
                    : "Loading Music (Please wait...)",
                ),
              ],
              components: [this.getPlaybackComponents(guildId)],
            });
            bufferingMsg = state.lastNowPlayingMsg;
          } catch (e) {
            bufferingMsg = await state.channel
              .send({
                embeds: [
                  this.getNowPlayingEmbed(
                    guildId,
                    fs.existsSync(cachePath)
                      ? "🚀 Ready to play"
                      : "Loading track... (Please wait)",
                  ),
                ],
                components: [this.getPlaybackComponents(guildId)],
              })
              .catch(() => null);
          }
        } else {
          bufferingMsg = await state.channel
            .send({
              embeds: [
                this.getNowPlayingEmbed(
                  guildId,
                  fs.existsSync(cachePath)
                    ? "🚀 Instant Sync Active"
                    : "Loading Music (Please wait...)",
                ),
              ],
              components: [this.getPlaybackComponents(guildId)],
            })
            .catch(() => null);
        }
        state.lastNowPlayingMsg = bufferingMsg;
        const artist = track.uploader || track.artist || "";
        const cleanName = this.clean(track.title, artist);
        const presence =
          artist && artist !== "---" ? `${artist} - ${cleanName}` : cleanName;

        if (state.channel.client.setTempStatus) {
          state.channel.client.setTempStatus(
            presence,
            ActivityType.Listening,
            null,
          );
        } else {
          state.channel.client.user.setActivity(presence, {
            type: ActivityType.Listening,
          });
        }
      }

      let audioStream;
      if (fs.existsSync(cachePath)) {
        audioStream = fs.createReadStream(cachePath);
      } else {
        const ytStreamArgs = [
          "-f",
          "140/ba/best",
          "--no-playlist",
          "--no-cache-dir",
          "--buffer-size",
          "1M",
          "-o",
          "-",
          ...getJsRuntimeArgs(),
          ...getCookiesArgs(),
          ...getVpsArgs(),
          track.url,
        ];
        const ytStreamProcess = spawn(getYtDlp(), ytStreamArgs, {
          env: getDlpEnv(),
        });
        const ffmpegProcess = spawn("ffmpeg", [
          "-analyzeduration",
          "0",
          "-probesize",
          "32768",
          "-i",
          "pipe:0",
          "-f",
          "s16le",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-af",
          "volume=1.0",
          "-loglevel",
          "0",
          "-buffer_size",
          "1024k",
          "pipe:1",
        ]);

        state.activeProcesses.push(ytStreamProcess, ffmpegProcess);

        ytStreamProcess.stdout.on("error", (e) => {
          if (e.code !== "EPIPE")
            console.error("[STREAM-YT] Error:", e.message);
        });

        ffmpegProcess.stdin.on("error", (e) => {
          if (e.code !== "EPIPE")
            console.error("[STREAM-FFMPEG] Error:", e.message);
        });

        ytStreamProcess.stdout.pipe(ffmpegProcess.stdin);
        audioStream = ffmpegProcess.stdout;

        if (track.duration && track.duration < 720) {
          const tmpPath = `${cachePath}.tmp`;
          const cacheWriter = fs.createWriteStream(tmpPath);
          ffmpegProcess.stdout.pipe(cacheWriter);

          ffmpegProcess.on("close", (code) => {
            if (code === 0) {
              fs.rename(tmpPath, cachePath, (err) => {
                if (err) console.error(`[CACHE] Rename failed: ${err.message}`);
              });
            } else {
              fs.unlink(tmpPath, () => {});
            }
          });
        }
      }

      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Raw,
      });
      state.resource = resource;
      state.player.play(resource);

      if (bufferingMsg) {
        state.player.once(AudioPlayerStatus.Playing, () => {
          bufferingMsg
            .edit({
              embeds: [this.getNowPlayingEmbed(guildId, "Now Playing")],
              components: [this.getPlaybackComponents(guildId)],
            })
            .catch(() => {});
        });
      }
    } catch (e) {
      console.error("[MUSIC-PLAY-NEXT] Error:", e.message);
      this.playNext(guildId);
    }
  }

  getNowPlayingEmbed(guildId, statusOverride = null) {
    const state = this.queues.get(guildId);
    if (!state || !state.current) return null;

    const track = state.current;
    const requester = state.channel.client.users.cache.get(track.requestedBy);
    const guild = state.channel.guild;

    const FIRE = this.getEmoji(guild, "purple_fire", "🔥");
    const LEA = this.getEmoji(guild, "ping_green", "✅");
    const ARROW = this.getEmoji(guild, "arrow", "»");

    const source =
      track.webpage_url?.includes("bandcamp.com") ||
      track.url?.includes("bandcamp.com")
        ? "Bandcamp"
        : "YouTube";

    let currentStatus = statusOverride;
    if (!currentStatus) {
      currentStatus =
        state.player.state.status === "paused"
          ? "Streaming Paused"
          : "Now Playing";
    }
    const repeatMode = (state.repeatMode || "OFF").toUpperCase();
    const shuffleMode = state.shuffle ? "ON" : "OFF";

    const artist = track.uploader || track.artist || "---";
    const cleanTitle = this.clean(track.title, artist);

    return new EmbedBuilder()
      .setColor(colors.PLAYER)
      .setAuthor({
        name: "MaveL Player",
        iconURL: requester?.displayAvatarURL() || undefined,
      })
      .setDescription(
        `### ${FIRE} **Now Streaming**\n` +
          `${ARROW} **Track:** [${cleanTitle.substring(0, 100)}](<${track.webpage_url || track.url}>)\n` +
          `${ARROW} **Artist:** *${artist}*\n` +
          `${ARROW} **Source:** *${source}*\n` +
          `${ARROW} **Added by:** <@${track.requestedBy}>\n` +
          `${ARROW} **Length:** *${track.duration_string || "---"}*\n` +
          `${ARROW} **Repeat:** *${repeatMode}*\n` +
          `${ARROW} **Shuffle:** *${shuffleMode}*\n\n` +
          `${LEA} **Status:** *${currentStatus}*\n` +
          `\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800`,
      )
      .setThumbnail(track.thumbnail)
      .setFooter({
        text: "MaveL Music",
        iconURL: state.channel.client.user.displayAvatarURL(),
      })
      .setTimestamp();
  }

  getPlaybackComponents(guildId) {
    const state = this.queues.get(guildId);
    if (!state || !state.channel) return null;

    const guild = state.channel.guild;

    const E_LYRICS = this.getEmoji(guild, "book", "📋");
    const E_SKIP = this.getEmoji(guild, "blue_arrow_right", "⏭️");
    const E_STOP = this.getEmoji(guild, "ping_red", "⏹️");
    const E_SHUFFLE = this.getEmoji(guild, "diamond", "🔀");
    const E_REPEAT = this.getEmoji(guild, "rocket", "🔁");
    const E_PAUSE = this.getEmoji(guild, "time", "⏸️");
    const E_QUEUE = this.getEmoji(guild, "anno", "📜");
    const E_CLEAR = this.getEmoji(guild, "lea", "🗑️");
    const E_PLAYLIST = this.getEmoji(guild, "three_dots", "📂");

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("music_control_hub")
        .setPlaceholder("Music Controls")
        .addOptions(
          {
            label: "Pause / Resume",
            value: "pause",
            description: "Toggle track playback",
            emoji: E_PAUSE,
          },
          {
            label: "Lyrics",
            value: "lyrics",
            description: "Get song lyrics",
            emoji: E_LYRICS,
          },
          {
            label: "Shuffle",
            value: "shuffle",
            description: `Toggle random order: ${state.shuffle ? "ON" : "OFF"}`,
            emoji: E_SHUFFLE,
          },
          {
            label: "Repeat",
            value: "repeat",
            description: `Cycle repeat modes: ${(state.repeatMode || "off").toUpperCase()}`,
            emoji: E_REPEAT,
          },
          {
            label: "Queue",
            value: "queue",
            description: "View upcoming tracks",
            emoji: E_QUEUE,
          },
          {
            label: "Skip",
            value: "skip",
            description: "Skip this track",
            emoji: E_SKIP,
          },
          {
            label: "Playlist",
            value: "playlist",
            description: "Load your saved playlists",
            emoji: E_PLAYLIST,
          },
          {
            label: "Clear",
            value: "clear",
            description: "Wipe current queue",
            emoji: E_CLEAR,
          },
          {
            label: "Stop",
            value: "stop",
            description: "Shutdown playback",
            emoji: E_STOP,
          },
        ),
    );
  }

  skip(guildId) {
    const state = this.queues.get(guildId);
    if (state) {
      state.player.stop();
    }
  }

  stop(guildId) {
    const state = this.queues.get(guildId);
    if (state) {
      if (state.idleTimer) clearTimeout(state.idleTimer);
      if (state.aloneTimer) clearTimeout(state.aloneTimer);
      if (state.pauseTimer) clearTimeout(state.pauseTimer);
      if (state.touchTimer) clearInterval(state.touchTimer);
      if (state.channel) {
        if (state.channel.client.clearTempStatus) {
          state.channel.client.clearTempStatus();
        } else {
          state.channel.client.user.setActivity("/help | MaveL", {
            type: ActivityType.Watching,
          });
        }
      }
      if (state.lastNowPlayingMsg) {
        const stoppedEmbed = this.getNowPlayingEmbed(guildId, "Stopped");
        state.lastNowPlayingMsg
          .edit({
            embeds: stoppedEmbed ? [stoppedEmbed] : [],
            components: [],
          })
          .catch(() => {});
      }
      if (state.activeProcesses) {
        state.activeProcesses.forEach((p) => {
          try {
            p.kill();
          } catch (e) {}
        });
        state.activeProcesses = [];
      }
      if (state.connection) state.connection.destroy();
      state.player.stop();
      this.queues.delete(guildId);
    }
  }

  pause(guildId) {
    const state = this.queues.get(guildId);
    if (state) {
      const success = state.player.pause();
      if (success && !state.pauseTimer) {
        state.pauseTimer = setTimeout(() => {
          const checkState = this.queues.get(guildId);
          if (checkState && checkState.player.state.status === AudioPlayerStatus.Paused) {
            if (checkState.channel) {
              const E_WARN = this.getEmoji(checkState.channel.guild, "ping_red", "🔴");
              checkState.channel.send(`${E_WARN} **Disconnected:** Music was paused for more than 5 minutes.`).catch(() => {});
            }
            this.stop(guildId);
          }
        }, 300000);
      }
      return success;
    }
    return false;
  }

  resume(guildId) {
    const state = this.queues.get(guildId);
    if (state) {
      if (state.pauseTimer) {
        clearTimeout(state.pauseTimer);
        state.pauseTimer = null;
      }
      return state.player.unpause();
    }
    return false;
  }

  setRepeat(guildId, mode) {
    const state = this.getQueue(guildId);
    state.repeatMode = mode;
    return mode;
  }

  toggleShuffle(guildId, mode) {
    const state = this.getQueue(guildId);
    state.shuffle = mode === "on";
    return state.shuffle;
  }

  getQueueList(guildId) {
    const state = this.queues.get(guildId);
    if (!state) return [];
    return state.queue.map((t, i) => `${i + 1}. ${t.title}`);
  }

  clear(guildId) {
    const state = this.queues.get(guildId);
    if (state) state.queue = [];
    return true;
  }

  remove(guildId, index) {
    const state = this.queues.get(guildId);
    if (state && state.queue[index - 1]) {
      return state.queue.splice(index - 1, 1)[0];
    }
    return null;
  }

  skipto(guildId, index) {
    const state = this.queues.get(guildId);
    if (state && state.queue[index - 1]) {
      state.queue.splice(0, index - 1);
      state.player.stop();
      return true;
    }
    return false;
  }
  clean(str, artist = "---") {
    let cleaned = str
      .replace(/\s*[\(\[][^)\]]*[\)\]]/g, "")
      .replace(
        /\s*[-|:»]?\s*(?:official|lyrics?|video|audio|hd|4k|hq|music video|visualizer|full video|lyric video|lirik|lagu|video lirik|terjemahan)[^\s]*/gi,
        "",
      )
      .replace(/\s*\|\s*$/, "")
      .replace(/\s*\|\s*/g, " | ");

    if (artist && artist !== "---") {
      const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const artistPatterns = [
        new RegExp(`^${escapedArtist}\\s*[-|:]\\s*`, "i"),
        new RegExp(`\\s*[-|:]\\s*${escapedArtist}$`, "i"),
      ];
      artistPatterns.forEach((p) => (cleaned = cleaned.replace(p, "")));
    }

    return cleaned
      .replace(/\s*[-|:]\s*$/, "")
      .replace(/\s\s+/g, " ")
      .trim();
  }
}

module.exports = new MusicPlayer();
