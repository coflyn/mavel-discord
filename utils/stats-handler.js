const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getMarketData } = require("./analytics");

/**
 * Updates or Creates the Market Pulse channels
 * @param {import('discord.js').Guild} guild
 */
async function updateServerStats(guild) {
  try {
    const market = await getMarketData(guild);

    const statsData = [
      { name: `💵 • USD/IDR : ${market.usdIdr}`, prefix: "💵" },
      { name: `🪙 • Bitcoin : ${market.btcUsd}`, prefix: "🪙" },
      { name: `🏅 • Gold : ${market.goldIdr}`, prefix: "🏅" },
      { name: `🛢️ • Brent Oil : ${market.brentOil}`, prefix: "🛢️" },
      { name: `☕ • Coffee : ${market.coffeeIndex}`, prefix: "☕" },
      {
        name: `${market.moonIcon || "🌑"} • Moon : ${market.moonName || "---"}`,
        prefix: "Moon",
      },
      { name: `🛰️ • ISS : ${market.issLocation}`, prefix: "🛰️" },
      { name: `🌧️ • Rain : ${market.rainChance}`, prefix: "🌧️" },
      {
        name: `👥 • Citizens : ${guild.memberCount.toLocaleString("id-ID")}`,
        prefix: "👥",
      },
      { name: `📊 • Requests : ${market.totalRequests}`, prefix: "📊" },
    ];

    let category = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        (c.name.includes("MARKET PULSE") || c.name.includes("Analytics")),
    );

    if (category && !guild.channels.cache.has(category.id)) {
      category = null;
    }

    if (!category) {
      category = await guild.channels.create({
        name: "Analytics",
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
    } else {
      if (category.position !== 0)
        await category.setPosition(0).catch(() => {});
      if (category.name !== "Analytics")
        await category.setName("Analytics").catch(() => {});
    }

    const validPrefixes = statsData.map((item) => item.prefix);
    const allMatching = guild.channels.cache.filter((c) =>
      validPrefixes.some((p) => c.name.includes(p)),
    );

    for (const [id, ch] of allMatching) {
      if (ch.parentId !== category.id) {
        await ch.delete().catch(() => {});
      }
    }

    for (let i = 0; i < statsData.length; i++) {
      const item = statsData[i];

      let channel = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name.includes(item.prefix),
      );

      if (!channel) {
        channel = await guild.channels.create({
          name: item.name,
          type: ChannelType.GuildVoice,
          parent: category.id,
          position: i,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.Connect] },
          ],
        });
      } else {
        if (channel.name !== item.name) {
          await channel.setName(item.name).catch(() => {});
        }
        if (channel.position !== i) {
          await channel.setPosition(i).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error("[MARKET-STATS-ERROR]", e.message);
  }
}

module.exports = { updateServerStats };
