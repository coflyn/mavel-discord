const { EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  name: "guildCreate",
  async execute(guild, client) {
    try {
      const botUser = await client.user.fetch();
      const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

      const guildEmojis = await guild.emojis.fetch();
      const ARROW =
        guildEmojis.find((e) => e.name === "arrow")?.toString() || "•";
      const LINK =
        guildEmojis.find((e) => e.name === "blue_arrow_right")?.toString() || "➡";
      const ANNO = guildEmojis.find((e) => e.name === "anno")?.toString() || "🚀";

      const welcomeEmbed = new EmbedBuilder()
        .setColor("#6c5ce7")
        .setTitle(`${ANNO} **MaveL is Ready!**`)
        .setImage(botBanner)
        .setDescription(
          `### ${LINK} **Successfully Joined!**\n` +
            `*MaveL is now connected to **${guild.name}**. To start using all features, please follow these steps:*\n\n` +
            `${ARROW} **Step 1:** Run **\`/emoji needs\`** to sync custom emojis.\n` +
            `${ARROW} **Step 2:** Run **\`/setup\`** to configure the bot.\n` +
            `${ARROW} **Step 3:** Run **\`/cookies\`** to enable premium downloads.\n\n` +
            `*Status: Waiting for Admin setup...*`,
        )
        .setFooter({ text: "MaveL System" })
        .setTimestamp();

      const channel =
        guild.systemChannel ||
        guild.channels.cache.find(
          (c) =>
            c.type === ChannelType.GuildText &&
            c.permissionsFor(guild.members.me).has("SendMessages"),
        );

      if (channel) {
        await channel.send({ embeds: [welcomeEmbed] });
      }

      client.guilds.cache.forEach((oldGuild) => {
        if (oldGuild.id !== guild.id) {
          console.log(
            `[SYSTEM] New server detected. Leaving old server ${oldGuild.name} in 60s.`,
          );
          setTimeout(async () => {
            try {
              await oldGuild.leave();
              console.log(`[SYSTEM] Left server ${oldGuild.name}.`);
            } catch (e) {
              console.error(
                `[ERROR] Failed to leave server ${oldGuild.name}:`,
                e.message,
              );
            }
          }, 60000);
        }
      });
    } catch (err) {
      console.error("[GUILD-CREATE] Error sending welcome:", err.message);
    }
  },
};
