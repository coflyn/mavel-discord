const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    advanceLog(client, {
      type: "error",
      title: "Member Left",
      activity: "Border Control",
      message: `${member.user.tag} has left the server`,
      user: `${member.user.tag} (${member.user.id})`,
      guild: member.guild.name,
      extra: `**Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
    });
  },
};
