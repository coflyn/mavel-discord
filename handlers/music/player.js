const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require("@discordjs/voice");
const { spawn } = require("child_process");
const {
  getYtDlp,
  getDlpEnv,
  getCookiesArgs,
  getVpsArgs,
  getJsRuntimeArgs,
} = require("../../utils/dlp-helpers");
const ffmpegStatic = require("ffmpeg-static");

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
        repeatMode: "off",
        shuffle: false,
      });
    }
    return this.queues.get(guildId);
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

    if (state.player.state.status === AudioPlayerStatus.Idle) {
      this.playNext(guildId);
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

  async playNext(guildId) {
    const state = this.getQueue(guildId);
    if (!state) return;

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
        }
      }, 30000);
      return;
    }

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }

    const trackIndex = state.shuffle
      ? Math.floor(Math.random() * state.queue.length)
      : 0;
    const track = state.queue.splice(trackIndex, 1)[0];
    state.current = track;

    try {
      const ytArgs = [
        "--buffer-size",
        "16K",
        "-e",
        "-g",
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

      const lines = out
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      const realTitle = lines[0] || track.title;
      const streamUrl = lines[1] || lines[0];

      if (!streamUrl || !streamUrl.startsWith("http")) {
        console.error(`[MUSIC-DLP] Failed for: ${track.title}`);
        console.error(`[MUSIC-DLP] Command Args: ${ytArgs.join(" ")}`);
        console.error(`[MUSIC-DLP] Stderr Output: ${err.trim()}`);
        throw new Error("Could not fetch stream URL");
      }

      const ffmpegProcess = spawn(ffmpegStatic, [
        "-re",
        "-i",
        streamUrl,
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-af",
        "volume=1.0",
        "pipe:1",
      ]);

      const resource = createAudioResource(ffmpegProcess.stdout, {
        inputType: StreamType.Raw,
      });
      state.player.play(resource);

      if (state.channel) {
        const msg = await state.channel
          .send({
            content: `*Now playing: ${track.title}*`,
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error("[MUSIC-PLAY-NEXT] Error:", e.message);
      this.playNext(guildId);
    }
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
      if (state.connection) state.connection.destroy();
      state.player.stop();
      this.queues.delete(guildId);
    }
  }

  pause(guildId) {
    const state = this.queues.get(guildId);
    if (state) return state.player.pause();
    return false;
  }

  resume(guildId) {
    const state = this.queues.get(guildId);
    if (state) return state.player.unpause();
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
}

module.exports = new MusicPlayer();
