const { EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = async function helpHandler(interaction) {
  const guildEmojis = await interaction.guild.emojis.fetch();
  const getEmoji = (name, fallback) => {
    const emoji = guildEmojis.find((e) => e.name === name);
    return emoji ? emoji.toString() : fallback;
  };

  const ARROW = getEmoji("arrow", ">");
  const DIAMOND = getEmoji("purple_fire", "💎");
  const NOTIF = getEmoji("notif", "🔔");
  const PC = getEmoji("crowncyan", "💻");
  const DOTS = getEmoji("three_dots", "🎵");
  const HELP = getEmoji("anno", "📚");

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
          `${ARROW} **/search** — *Integrated search engine*`,
        inline: false,
      },
      {
        name: `${NOTIF} **Assets & Intelligence**`,
        value:
          `${ARROW} **/icon** — *Grab high-res icon asset (User/Server)*\n` +
          `${ARROW} **/banner** — *Grab high-res banner asset (User/Server)*\n` +
          `${ARROW} **/server** — *Check operational base information*\n` +
          `${ARROW} **/setup** — *Configure system channel endpoints*\n` +
          `${ARROW} **/info** — *Check user intelligence and profile*\n` +
          `${ARROW} **/emoji** — *Advanced server emoji management*\n` +
          `${ARROW} **/diagnostics** — *Performance & Pulse Analysis*\n` +
          `${ARROW} **/ping** — *Monitor connection latency*`,
        inline: false,
      },
      {
        name: `${PC} **Playback & Operations**`,
        value:
          `${ARROW} **/play** — *Initialize audio playback*\n` +
          `${ARROW} **/stop** — *Decommission player and disconnect*\n` +
          `${ARROW} **/lyrics** — *Extract song metadata and lyrics*\n` +
          `${ARROW} **/nowplaying** — *Display active track details*\n` +
          `${ARROW} **/skip** — *Bypass current audio track*\n` +
          `${ARROW} **/pause** — *Suspend audio playback*\n` +
          `${ARROW} **/resume** — *Restore audio playback*`,
        inline: false,
      },
      {
        name: `${DOTS} **Library & Queue**`,
        value:
          `${ARROW} **/queue** — *Monitor synchronized queue*\n` +
          `${ARROW} **/shuffle** — *Randomize queue sequence*\n` +
          `${ARROW} **/repeat** — *Define playback repetition mode*\n` +
          `${ARROW} **/clear** — *Wipe current synchronized queue*\n` +
          `${ARROW} **/remove** — *Detach specific track from queue*\n` +
          `${ARROW} **/skipto** — *Bypass to specific track index*\n` +
          `${ARROW} **/playlist** — *Handle personal audio registries*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Hub Operator",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  if (interaction.isCommand?.()) {
    const reply = await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 300000);
  } else if (interaction.reply) {
    const reply = await interaction.reply({ embeds: [embed] }).catch(() => {});
    if (reply && reply.delete) {
      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 300000);
    }
  }
};
