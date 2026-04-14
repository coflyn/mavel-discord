const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    if (message.partial || !message.guild || message.author?.bot) return;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    let executor = "Unknown (Self or Fast Delay)";
    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: 72,
      });
      const deletionLog = fetchedLogs.entries.first();

      if (deletionLog) {
        const { executor: user, target } = deletionLog;
        if (
          target.id === message.author.id &&
          Date.now() - deletionLog.createdAt < 10000
        ) {
          executor = `${user.tag} (${user.id})`;
        } else {
          executor = "User (Self)";
        }
      }
    } catch (e) {
      executor = "User (Self or No Perms)";
    }

    advanceLog(client, {
      type: "warn",
      title: "Message Deleted",
      activity: "Message Management",
      message: `A message was removed in #${message.channel.name}`,
      user: `${message.author.tag} (${message.author.id})`,
      guild: message.guild.name,
      extra:
        `**Content:** ${message.content || "*(No Text Content)*"}\n` +
        `**Deleted By:** ${executor}\n` +
        `**Channel:** <#${message.channel.id}>`,
    });
  },
};
