const { advanceLog } = require("../utils/logger");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    const diffRoles = newMember.roles.cache.filter(
      (role) => !oldMember.roles.cache.has(role.id),
    );
    const removedRoles = oldMember.roles.cache.filter(
      (role) => !newMember.roles.cache.has(role.id),
    );

    let auditMsg = "";
    if (diffRoles.size > 0)
      auditMsg = `**Added Roles:** ${diffRoles.map((r) => r.name).join(", ")}`;
    else if (removedRoles.size > 0)
      auditMsg = `**Removed Roles:** ${removedRoles.map((r) => r.name).join(", ")}`;
    else if (oldMember.nickname !== newMember.nickname)
      auditMsg = `**Nickname Change:** \`${oldMember.nickname || "None"}\` ➔ \`${newMember.nickname || "None"}\``;

    if (!auditMsg) return;

    advanceLog(client, {
      type: "warn",
      title: "Member Audit",
      activity: "Profile Management",
      message: `Update for ${newMember.user.tag}`,
      user: `${newMember.user.tag} (${newMember.user.id})`,
      guild: newMember.guild.name,
      extra: auditMsg,
    });
  },
};
