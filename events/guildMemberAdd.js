const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    advanceLog(client, {
      type: "success",
      title: "Member Joined",
      activity: "Border Control",
      message: `${member.user.tag} has entered the server`,
      user: `${member.user.tag} (${member.user.id})`,
      guild: member.guild.name,
      extra: `**Created Account:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    });
  },
};
