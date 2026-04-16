const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = async function helpHandler(interaction) {
  if (interaction.deferReply && (interaction.isChatInputCommand?.() || interaction.isButton?.() || interaction.isStringSelectMenu?.())) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(e => console.error("[HELP-DEFER]", e.message));
  }

  const guild = interaction.guild || interaction.client.guilds.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);

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

  try {
    const embed = new EmbedBuilder()
      .setColor("#fdcb6e")
      .setAuthor({
        name: "MaveL Help Guide",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${HELP || "📚"} **Main Menu**`);

    if (botBanner) {
      embed.setImage(botBanner);
    }

    embed.setDescription(
      `*MaveL is a fast and easy music player and media downloader for your Discord server.*`,
    )
    .addFields(
      {
        name: `${DIAMOND || "✨"} **Main Features**`,
        value:
          `${ARROW} **/dl** — *Download media from various sites*\n` +
          `${ARROW} **/harvest** — *Analyze and extract data from profiles*\n` +
          `${ARROW} **/convert** — *Transform Video/Audio/Image formats*\n` +
          `${ARROW} **/search** — *Search for songs (YouTube/Spotify/etc)*\n` +
          `${ARROW} **/lyrics** — *Get song lyrics and info*`,
        inline: false,
      },
      {
        name: `${NOTIF || "🔔"} **Files & Information**`,
        value:
          `${ARROW} **/icon** — *Get server/user avatar*\n` +
          `${ARROW} **/banner** — *Get server/user banner link*\n` +
          `${ARROW} **/emoji list** — *List all server emojis*\n` +
          `${ARROW} **/emoji** ${LOCK} — *Manage server emojis (add/rename/delete)*\n` +
           `${ARROW} **/emoji needs** ${LOCK} — *Add missing system emojis*\n` +
          `${ARROW} **/info** — *Check user info and profile*\n` +
          `${ARROW} **/ss** — *Capture a screenshot of any website*\n` +
          `${ARROW} **/inspect** — *Expose hidden details & EXIF data*`,
        inline: false,
      },
      {
        name: `${PC || "💻"} **Music Controls**`,
        value:
          `${ARROW} **/play** — *Start playing music*\n` +
          `${ARROW} **/stop** — *Stop music and disconnect*\n` +
          `${ARROW} **/nowplaying** — *Show what's currently playing*\n` +
          `${ARROW} **/skip** — *Skip the current song*\n` +
          `${ARROW} **/pause** / **/resume** — *Pause or resume playback*`,
        inline: false,
      },
      {
        name: `${DOTS || "🎵"} **Queue & Playlists**`,
        value:
          `${ARROW} **/queue** — *View the current music queue*\n` +
          `${ARROW} **/playlist** — *Directly manage your playlists*\n` +
          `${ARROW} **/shuffle** — *Shuffle the current queue*\n` +
          `${ARROW} **/repeat** — *Change the repeat mode*\n` +
          `${ARROW} **/clear** — *Clear all songs in the queue*`,
        inline: false,
      },
      {
        name: `${ROCKET || "🚀"} **System Management**`,
        value:
          `${ARROW} **/server** — *Show server info*\n` +
          `${ARROW} **/setup** ${LOCK} — *Configure bot channels*\n` +
          `${ARROW} **/move** ${LOCK} — *Add bot to another server*\n` +
          `${ARROW} **/diagnostics** ${LOCK} — *Check performance, IP & location*\n` +
          `${ARROW} **/hibernate** / **/wakeup** ${LOCK} — *Sleep/active mode*`,
        inline: false,
      },
      {
        name: `${LOCK || "🔐"} **System Maintenance**`,
        value:
          `${ARROW} **/purge** ${LOCK} — *Delete logs or temp files*\n` +
          `${ARROW} **/delete** ${LOCK} — *Clean messages (DMs/Guilds)*\n` +
          `${ARROW} **/backup** ${LOCK} — *Backup current system data*\n` +
          `${ARROW} **/logs** ${LOCK} — *View last system logs*\n` +
          `${ARROW} **/cookies** ${LOCK} — *Update cookie settings*\n` +
          `${ARROW} **/ping** — *Check latency and bot speed*`,
        inline: false,
      },
    )
    .setFooter({
      text: "MaveL Bot Support",
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

    if (interaction.isChatInputCommand?.() || interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      }
      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    } else {
      await interaction.reply({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error("[HELP-EMBED] Critical Error:", err);
  }
};
