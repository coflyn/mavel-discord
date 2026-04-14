const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "roleDelete",
  async execute(role, client) {
    await new Promise((r) => setTimeout(r, 1000));
    let executor = "Unknown";
    try {
      const logs = await role.guild.fetchAuditLogs({ limit: 1, type: 32 });
      executor = logs.entries.first()?.executor.tag || "System";
    } catch (e) {}

    advanceLog(client, {
      type: "error",
      title: "Role Deleted",
      activity: "Architecture Audit",
      message: `Role removed: ${role.name}`,
      user: executor,
      guild: role.guild.name,
      extra: `**Role ID:** \`${role.id}\``,
    });
  },
};
