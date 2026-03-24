const { EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = async function helpHandler(interaction) {
  const guildEmojis = await interaction.guild.fetch().then(g => g.emojis.cache);
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const DIAMOND = getEmoji("purple_fire", "✨");
  const NOTIF = getEmoji("notif", "🔔");
  const PC = getEmoji("crowncyan", "💻");
  const DOTS = getEmoji("three_dots", "🎵");
  const HELP = getEmoji("anno", "📚");
  const ROCKET = getEmoji("rocket", "🚀");
  const LOCK = getEmoji("cash", "🔐");

  const botUser = await interaction.client.user.fetch();
  const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

  const embed = new EmbedBuilder()
    .setColor("#1e4d2b")
    .setAuthor({
      name: "MaveL Operation Guide",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTitle(`${HELP} **Central Command Hub**`)
    .setImage(botBanner)
    .setDescription(
      `*MaveL is a high-performance utility system for media synthesis and information retrieval.*`,
    )
    .addFields(
      {
        name: `${DIAMOND} **Core Operations**`,
        value:
          `${ARROW} **/dl** — *Universal media downloader*\n` +
          `${ARROW} **/search** — *Integrated search engine (YT/BC)*\n` +
          `${ARROW} **/lyrics** — *Extract song metadata and lyrics*`,
        inline: false,
      },
      {
        name: `${NOTIF} **Assets & Intelligence**`,
        value:
          `${ARROW} **/icon** — *Grab high-res icon asset (User/Server)*\n` +
          `${ARROW} **/banner** — *Grab high-res banner asset (User/Server)*\n` +
          `${ARROW} **/emoji list** — *List all server assets*\n` +
          `${ARROW} **/emoji** ${LOCK} — *Manage emoji assets (add/rename/delete)*\n` +
          `${ARROW} **/emoji needs** ${LOCK} — *Sync missing system assets*\n` +
          `${ARROW} **/info** — *Check user intelligence and profile*`,
        inline: false,
      },
      {
        name: `${PC} **Playback & Controls**`,
        value:
          `${ARROW} **/play** — *Initialize audio playback*\n` +
          `${ARROW} **/stop** — *Decommission player and disconnect*\n` +
          `${ARROW} **/nowplaying** — *Display active track details*\n` +
          `${ARROW} **/skip** — *Bypass current audio track*\n` +
          `${ARROW} **/skipto** — *Bypass to specific track index*\n` +
          `${ARROW} **/pause** / **/resume** — *Global playback control*`,
        inline: false,
      },
      {
        name: `${DOTS} **Library & Registry**`,
        value:
          `${ARROW} **/queue** — *Monitor synchronized queue*\n` +
          `${ARROW} **/playlist** — *Handle personal audio registries*\n` +
          `${ARROW} **/shuffle** — *Randomize queue sequence*\n` +
          `${ARROW} **/repeat** — *Define playback repetition mode*\n` +
          `${ARROW} **/clear** — *Wipe current synchronized queue*\n` +
          `${ARROW} **/remove** — *Detach specific track from queue*`,
        inline: false,
      },
      {
        name: `${ROCKET} **System Administration**`,
        value:
          `${ARROW} **/server** — *Check operational base information*\n` +
          `${ARROW} **/setup** ${LOCK} — *Configure system endpoints*\n` +
          `${ARROW} **/move** ${LOCK} — *Induction link for migration*\n` +
          `${ARROW} **/reset tunnel** ${LOCK} — *Regenerate tunnel*\n` +
          `${ARROW} **/diagnostics** ${LOCK} — *Performance Report*\n` +
          `${ARROW} **/hibernate** / **/wakeup** ${LOCK} — *Operational Standby*\n` +
          `${ARROW} **/purge** / **/backup** ${LOCK} — *Asset & Registry care*\n` +
          `${ARROW} **/scan** / **/logs** ${LOCK} — *In-depth Integrity Audit*\n` +
          `${ARROW} **/ping** — *Monitor latency*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Hub Operator",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  if (interaction.isCommand?.()) {
    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  } else if (interaction.reply) {
    await interaction.reply({ embeds: [embed] }).catch(() => {});
  }
};
