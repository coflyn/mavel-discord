const { advanceLog } = require("../utils/logger");
const { player } = require("../handlers/music");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    const guild = oldState.guild;
    const member = newState.member || oldState.member;
    if (!member) return;
    const user = member.user;

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
      } else if (oldState.selfMute !== newState.selfMute) {
        advanceLog(client, {
          type: "info",
          title: "Voice Activity",
          activity: "VC Monitoring",
          message: `${user.tag} ${newState.selfMute ? "muted" : "unmuted"} themselves`,
          user: `${user.tag} (${user.id})`,
          guild: guild.name,
        });
      } else if (oldState.selfDeaf !== newState.selfDeaf) {
        advanceLog(client, {
          type: "info",
          title: "Voice Activity",
          activity: "VC Monitoring",
          message: `${user.tag} ${newState.selfDeaf ? "deafened" : "undeafened"} themselves`,
          user: `${user.tag} (${user.id})`,
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
  },
};
