const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    await new Promise((r) => setTimeout(r, 1000));
    let executor = "Unknown";
    try {
      const logs = await role.guild.fetchAuditLogs({ limit: 1, type: 30 });
      executor = logs.entries.first()?.executor.tag || "System";
    } catch (e) {}

    advanceLog(client, {
      type: "success",
      title: "Role Created",
      activity: "Architecture Audit",
      message: `New role structure: ${role.name}`,
      user: executor,
      guild: role.guild.name,
      extra: `**Role ID:** \`${role.id}\``,
    });
  },
};
