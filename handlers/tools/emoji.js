const {
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { REQUIRED_EMOJIS } = require("../../utils/emoji-registry");
const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");
const http = require("../../utils/http");

module.exports = async function emojiHandler(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "needs") {
    return handleNeeds(interaction);
  }
};

async function handleNeeds(interaction) {
  const guildEmojis = await interaction.guild.emojis.fetch();
  const missing = REQUIRED_EMOJIS.filter(
    (req) => !guildEmojis.some((e) => e.name === req.name),
  );

  const getEmoji = (name, fallback) =>
    resolveEmoji(interaction, name, fallback);

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("lea", "🛰️");
  const PC = getEmoji("pc", "💻");
  const CAMERA = getEmoji("camera", "🛰️");
  const DIAMOND = getEmoji("diamond", "✨");
  const ROCKET = getEmoji("rocket", "🚀");
  const CHECK = getEmoji("check", "✅");
  const CROSS = getEmoji("ping_red", "🔴");

  const embed = new EmbedBuilder()
    .setColor(colors.SOCIAL)
    .setTitle("*MaveL Emojis*")
    .setDescription(
      REQUIRED_EMOJIS.map((req) => {
        const exists = guildEmojis.some((e) => e.name === req.name);
        return `${ARROW} \`${req.name}\`: ${exists ? CHECK : CROSS}`;
      }).join("\n"),
    );

  if (missing.length > 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sync_emojis")
        .setLabel(`Add Missing Emojis (${missing.length})`)
        .setStyle(ButtonStyle.Primary),
    );

    return interaction.deferred
      ? interaction.editReply({
          embeds: [embed],
          components: [row],
        })
      : interaction.reply({
          embeds: [embed],
          components: [row],
          flags: [MessageFlags.Ephemeral],
        });
  } else {
    return interaction.deferred
      ? interaction.editReply({
          embeds: [embed],
          content: "*All required emojis are already added and ready.*",
        })
      : interaction.reply({
          embeds: [embed],
          content: "*All required emojis are already added and ready.*",
          flags: [MessageFlags.Ephemeral],
        });
  }
}

module.exports.syncMissingEmojis = async function (interaction) {
  if (!interaction.member.permissions.has("ManageGuildExpressions")) {
    return interaction.reply({
      content: "*You do not have permission to manage emojis.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  await interaction.deferUpdate();

  const guildEmojis = await interaction.guild.emojis.fetch();
  const missing = REQUIRED_EMOJIS.filter(
    (req) => !guildEmojis.some((e) => e.name === req.name),
  );

  const PING_GREEN =
    guildEmojis.find((e) => e.name === "ping_green")?.toString() || "🟢";
  const PING_RED =
    guildEmojis.find((e) => e.name === "ping_red")?.toString() || "🔴";

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(colors.SOCIAL)
        .setDescription(
          `### ⏳ **Getting Emojis...**\n*Please wait while MaveL adds the missing emojis.*`,
        ),
    ],
    components: [],
  });

  let successCount = 0;
  let failCount = 0;

  for (const req of missing) {
    const emojiId = req.id;
    const animatedUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?quality=lossless`;
    const staticUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?quality=lossless`;
    const fetchOptions = { 
      headers: { "User-Agent": http.getUserAgent("bot") },
      responseType: "arraybuffer",
      validateStatus: () => true,
    };

    try {
      let response = await http.get(animatedUrl, fetchOptions);
      if (response.status !== 200) response = await http.get(staticUrl, fetchOptions);

      if (response.status === 200) {
        const buffer = Buffer.from(response.data);
        await interaction.guild.emojis.create({
          attachment: buffer,
          name: req.name,
        });
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(colors.SOCIAL)
    .setTitle("*Emoji Setup Finished*")
    .setDescription(
      `### ${successCount > 0 ? PING_GREEN : PING_RED} **Update Complete**\n*Successfully added **${successCount}** emojis.*\n*Failed to get **${failCount}** emojis.*`,
    );

  await interaction.editReply({
    embeds: [embed],
    components: [],
  });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
};
