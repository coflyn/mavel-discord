const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "roleUpdate",
  async execute(oldR, newR, client) {
    if (oldR.name === newR.name) return;
    await new Promise((r) => setTimeout(r, 1000));
    let executor = "Unknown";
    try {
      const logs = await newR.guild.fetchAuditLogs({ limit: 1, type: 31 });
      executor = logs.entries.first()?.executor.tag || "System";
    } catch (e) {}

    advanceLog(client, {
      type: "warn",
      title: "Role Modified",
      activity: "Architecture Audit",
      message: `Rename: ${oldR.name} ➔ ${newR.name}`,
      user: executor,
      guild: newR.guild.name,
      extra: `**Role:** <@&${newR.id}>`,
    });
  },
};
