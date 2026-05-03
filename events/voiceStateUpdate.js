const { advanceLog } = require("../utils/logger");
const { player } = require("../handlers/music");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    const guild = oldState.guild;
    const member = newState.member || oldState.member;
    if (!member) return;

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
