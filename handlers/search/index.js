const { spawn } = require("child_process");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
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
    const searchList = [
      "*MaveL Integrated Search:*",
      "> *YouTube (Video Download)*",
      "> *YouTube Music (Audio Download)*",
      "> *Spotify (Audio Sync Search)*",
      "> *SoundCloud (Direct Audio Search)*",
    ].join("\n");

    await interaction.reply({
      content: searchList,
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

  const isMusic = typeSelection !== "yt";

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
        content: "*No results found or search failed.*",
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
        content: "*No results found after parsing.*",
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

    await interaction.editReply({
      content: `*Found ${results.length} results for: ${query} (${typeSelection.toUpperCase()})*`,
      components: [row],
    });
  });
};
