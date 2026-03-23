const { spawn } = require("child_process");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const {
  getYtDlp,
  getDlpEnv,
  getJsRuntimeArgs,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");

module.exports = async function searchHandler(interaction) {
  const query = interaction.options.getString("query");
  const typeSelection = interaction.options.getString("type") || "yt";

  if (!query) {
    const guildEmojis = await interaction.guild.emojis.fetch();
    const getEmoji = (name, fallback) => {
      const emoji = guildEmojis.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ARROW = getEmoji("arrow", ">");
    const FIRE = getEmoji("purple_fire", "🔥");
    const SEARCH = getEmoji("amogus", "🔎");
    const DOTS = getEmoji("three_dots", "🎵");

    const botUser = await interaction.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setAuthor({
        name: "MaveL Search Engine",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${SEARCH} **Integrated Pulse Search**`)
      .setImage(botBanner)
      .setDescription(
        `*Multi-platform indexing system for direct media retrieval.*`,
      )
      .addFields(
        {
          name: `${FIRE} **Visuals**`,
          value: `${ARROW} *YouTube (Video Download)*`,
          inline: false,
        },
        {
          name: `${DOTS} **Acoustics**`,
          value:
            `${ARROW} *YouTube Music (Audio Download)*\n` +
            `${ARROW} *Spotify (Audio Sync Search)*\n` +
            `${ARROW} *SoundCloud (Direct Audio Search)*`,
          inline: false,
        },
      )
      .setFooter({
        text: "MaveL | Select Option Above",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 60000);

    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let searchSpec = `ytsearch10:${query}`;
  let typeLabel = "video";

  if (typeSelection === "ytm") {
    searchSpec = `ytsearch10:${query} music`;
    typeLabel = "song";
  } else if (typeSelection === "spot") {
    searchSpec = `ytsearch10:${query} music`;
    typeLabel = "Spotify track";
  } else if (typeSelection === "sc") {
    searchSpec = `scsearch10:${query}`;
    typeLabel = "SoundCloud track";
  }

  const args = [
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--no-check-certificate",
    ...getJsRuntimeArgs(),
    ...getCookiesArgs(),
    ...getVpsArgs(),
    searchSpec,
  ];

  const searchProcess = spawn(getYtDlp(), args, { env: getDlpEnv() });
  let output = "";
  let errorLog = "";

  searchProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  searchProcess.stderr.on("data", (data) => {
    errorLog += data.toString();
  });

  searchProcess.on("close", async (code) => {
    if (code !== 0 || !output.trim()) {
      console.error("[SEARCH-YTDLP] Error Code:", code, errorLog);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#1e4d2b")
            .setDescription(
              `### ❌ **No results found**\n> *Search failed for: ${query}*`,
            ),
        ],
      });
    }

    const lines = output.trim().split("\n");
    const results = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter((res) => res && (res.url || res.webpage_url || res.id));

    if (results.length === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#1e4d2b")
            .setDescription(
              `### ❌ **No results found**\n> *Result parsing yielded 0 entries.*`,
            ),
        ],
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`search_select_${typeSelection}`)
      .setPlaceholder(`Choose a ${typeLabel} to download...`)
      .addOptions(
        results.slice(0, 10).map((res, index) => {
          const title = res.title || "Untitled";
          const uploader = res.uploader || "Unknown";
          const url =
            res.webpage_url ||
            (res.url
              ? res.url.startsWith("http")
                ? res.url
                : `https://www.youtube.com/watch?v=${res.url}`
              : res.id
                ? `https://www.youtube.com/watch?v=${res.id}`
                : "");

          return {
            label: `${index + 1}. ${title.substring(0, 90)}`,
            description: `By: ${uploader.substring(0, 50)}`,
            value: url,
          };
        }),
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const AMOGUS =
      (await interaction.guild.emojis.fetch())
        .find((e) => e.name === "amogus")
        ?.toString() || "🔎";

    const resultEmbed = new EmbedBuilder()
      .setColor("#1e4d2b")
      .setDescription(
        `### ${AMOGUS} **Search Synchronized**\n` +
          `*Found **${results.length}** results for:* \`${query}\`\n` +
          `*Target Engine:* \`${typeSelection.toUpperCase()}\``,
      )
      .setFooter({ text: "Select a resource from the menu below to proceed" });

    await interaction.editReply({
      embeds: [resultEmbed],
      components: [row],
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 300000);
  });
};
