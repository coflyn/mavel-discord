const { EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = async function helpHandler(interaction) {
  if (interaction.deferReply && (interaction.isChatInputCommand?.() || interaction.isButton?.() || interaction.isStringSelectMenu?.())) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(e => console.error("[HELP-DEFER]", e.message));
  }

  const guild = interaction.guild || interaction.client.guilds.cache.first();
  const guildEmojis = await guild.emojis.fetch().catch(() => null);
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis?.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", "•");
  const DIAMOND = getEmoji("diamond", "✨");
  const NOTIF = getEmoji("notif", "🔔");
  const PC = getEmoji("pc", "💻");
  const DOTS = getEmoji("three_dots", "🎵");
  const HELP = getEmoji("anno", "📚");
  const ROCKET = getEmoji("rocket", "🚀");
  const LOCK = getEmoji("cash", "🔐");
  const FIRE = getEmoji("purple_fire", "🔥");
  const CAMERA = getEmoji("camera", "📷");

  const botUser = await interaction.client.user.fetch();
  const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

  const embed = new EmbedBuilder()
    .setColor("#fdcb6e")
    .setAuthor({
      name: "MaveL Operation Guide",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTitle(`${HELP} **Central Strategic Hub**`)
    .setImage(botBanner)
    .setDescription(
      `*MaveL is a high-performance utility system for media synthesis, decryption, and global information retrieval.*`,
    )
    .addFields(
      {
        name: `${DIAMOND} **Core Protocols**`,
        value:
          `${ARROW} **/dl** — *Universal media downloader*\n` +
          `${ARROW} **/search** — *Integrated search engine (YT/SPOT/BC)*\n` +
          `${ARROW} **/lyrics** — *Extract song metadata and lyrics*`,
        inline: false,
      },
      {
        name: `${NOTIF} **Assets & Intelligence**`,
        value:
          `${ARROW} **/icon** — *Grab high-res icon asset (User/Server)*\n` +
          `${ARROW} **/banner** — *Grab high-res banner asset (User/Server)*\n` +
          `${ARROW} **/emoji list** — *List all server assets (IDs)*\n` +
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
          `${ARROW} **/clear** — *Wipe current synchronized queue*`,
        inline: false,
      },
      {
        name: `${ROCKET} **System Administration**`,
        value:
          `${ARROW} **/server** — *Check operational base information*\n` +
          `${ARROW} **/setup** ${LOCK} — *Configure system endpoints*\n` +
          `${ARROW} **/move** ${LOCK} — *Induction link for migration*\n` +
          `${ARROW} **/diagnostics** ${LOCK} — *Performance Analysis*\n` +
          `${ARROW} **/hibernate** / **/wakeup** ${LOCK} — *Operational Standby*\n` +
          `${ARROW} **/purge** / **/backup** ${LOCK} — *Asset & Registry care*\n` +
          `${ARROW} **/logs** ${LOCK} — *Extract last operational logs*\n` +
          `${ARROW} **/cookies** ${LOCK} — *Update session datasets*\n` +
          `${ARROW} **/ping** — *Monitor latency and status*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Hub Operator | Verified System",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  if (interaction.editReply && (interaction.isChatInputCommand?.() || interaction.isButton?.() || interaction.isStringSelectMenu?.())) {
    try {
      await interaction.editReply({
        embeds: [embed],
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    } catch (e) {
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] }).catch(() => {});
      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    }
  } else if (interaction.reply) {
    await interaction.reply({ embeds: [embed] }).catch(() => {});
  }
};
