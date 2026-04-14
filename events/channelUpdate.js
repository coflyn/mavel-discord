const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "channelUpdate",
  async execute(oldC, newC, client) {
    if (!newC.guild || oldC.name === newC.name) return;
    await new Promise((r) => setTimeout(r, 1000));
    let executor = "Unknown";
    try {
      const logs = await newC.guild.fetchAuditLogs({ limit: 1, type: 11 });
      executor = logs.entries.first()?.executor.tag || "System";
    } catch (e) {}

    advanceLog(client, {
      type: "warn",
      title: "Channel Modified",
      activity: "Architecture Audit",
      message: `Rename: #${oldC.name} ➔ #${newC.name}`,
      user: executor,
      guild: newC.guild.name,
      extra: `**Channel:** <#${newC.id}>`,
    });
  },
};
