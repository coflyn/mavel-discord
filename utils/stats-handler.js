const { ChannelType, PermissionFlagsBits } = require("discord.js");

/**
 * Updates or Creates the server statistics channels with strict ordering
 * @param {import('discord.js').Guild} guild
 */
async function updateServerStats(guild) {
  try {
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount = totalMembers - botCount;

    const statsData = [
      { name: `👥 • Everyone : ${totalMembers}`, prefix: "👥" },
      { name: `👤 • Humans : ${humanCount}`, prefix: "👤" },
      { name: `🤖 • Bots : ${botCount}`, prefix: "🤖" },
    ];

    let category = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        (c.name.includes("SERVER STATS") || c.name.includes("Analytics")),
    );

    if (!category) {
      category = await guild.channels.create({
        name: "📊 | Analytics",
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
    } else {
      if (category.position !== 0)
        await category.setPosition(0).catch(() => {});
      if (category.name !== "📊 | Analytics")
        await category.setName("📊 | Analytics").catch(() => {});
    }

    const oldMavel = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.name.includes("🍀"),
    );
    if (oldMavel) await oldMavel.delete().catch(() => {});

    for (let i = 0; i < statsData.length; i++) {
      const item = statsData[i];

      let channel = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name.startsWith(item.prefix),
      );

      if (!channel) {
        channel = guild.channels.cache.find((c) =>
          c.name.startsWith(item.prefix),
        );
      }

      if (!channel) {
        await guild.channels.create({
          name: item.name,
          type: ChannelType.GuildVoice,
          parentId: category.id,
          position: i,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.Connect] },
          ],
        });
      } else {
        const needsUpdate =
          channel.name !== item.name || channel.parentId !== category.id;

        if (needsUpdate) {
          await channel
            .edit({
              name: item.name,
              parentId: category.id,
              position: i,
            })
            .catch(() => {});
        }

        await channel.setPosition(i).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[STATS-ERROR]", e.message);
  }
}

module.exports = { updateServerStats };
