const { advanceLog } = require("../utils/logger");
const { ChannelType } = require("discord.js");

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    if (!channel.guild) return;
    await new Promise((r) => setTimeout(r, 1000));
    let executor = "Unknown";
    try {
      const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: 10 });
      executor = logs.entries.first()?.executor.tag || "System";
    } catch (e) {}

    advanceLog(client, {
      type: "success",
      title: "Channel Created",
      activity: "Architecture Audit",
      message: `New channel: #${channel.name}`,
      user: executor,
      guild: channel.guild.name,
      extra: `**Type:** ${ChannelType[channel.type]}\n**Target:** <#${channel.id}>`,
    });
  },
};
