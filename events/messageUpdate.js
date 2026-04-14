const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "messageUpdate",
  async execute(oldMsg, newMsg, client) {
    if (oldMsg.partial || oldMsg.author?.bot || oldMsg.content === newMsg.content)
      return;

    advanceLog(client, {
      type: "warn",
      title: "Message Edited",
      activity: "Message Management",
      message: `A message was modified in #${oldMsg.channel.name}`,
      user: `${oldMsg.author.tag} (${oldMsg.author.id})`,
      guild: oldMsg.guild.name,
      extra:
        `**Old Content:** ${oldMsg.content || "*(No Text)*"}\n` +
        `**New Content:** ${newMsg.content || "*(No Text)*"}\n` +
        `**Channel:** <#${oldMsg.channel.id}>`,
    });
  },
};
