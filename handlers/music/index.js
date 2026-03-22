const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const player = require("./player");
const {
  getYtDlp,
  getDlpEnv,
  getCookiesArgs,
  getVpsArgs,
} = require("../../utils/dlp-helpers");
const { spawn } = require("child_process");

async function musicHandler(target, manualData = null) {
  const isInteraction =
    !!target.isChatInputCommand || !!target.isStringSelectMenu;
  const guildId = target.guild.id;
  const voiceChannel = target.member.voice.channel;
  const author = isInteraction ? target.user : target.author;

  if (!voiceChannel) {
    const msg = "*You must be in a voice channel first.*";
    return isInteraction
      ? target.reply({ content: msg, flags: [MessageFlags.Ephemeral] })
      : target.reply(msg);
  }

  let url =
    manualData && manualData.url
      ? manualData.url
      : target.content && target.content.match(/https?:\/\/[^\s]+/)
        ? target.content.match(/https?:\/\/[^\s]+/)[0]
        : "";
  let query =
    manualData && manualData.title
      ? manualData.title
      : url
        ? ""
        : target.content || "";

  if (!url && query) {
    const searchingMsg = "*Searching YouTube Music...*";
    if (isInteraction) {
      await target.reply({
        content: searchingMsg,
        flags: [MessageFlags.Ephemeral],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 15000);
    } else await target.reply(searchingMsg);

    const trySearch = async (prefix) => {
      const searchArgs = [
        `${prefix}:${query}`,
        "--dump-json",
        "--flat-playlist",
        ...getCookiesArgs(),
        ...getVpsArgs(),
      ];

      const proc = spawn(getYtDlp(), searchArgs, { env: getDlpEnv() });
      let out = "";
      proc.stdout.on("data", (d) => (out += d));
      await new Promise((r) => proc.on("close", r));

      return out
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch (e) {
            return null;
          }
        })
        .filter((r) => r);
    };

    let results = await trySearch("ytmsearch5");

    if (results.length === 0) {
      results = await trySearch("ytsearch5");
    }

    if (results.length === 0) {
      const errorMsg = "*No music found for your query.*";
      if (isInteraction) {
        await target.editReply({ content: errorMsg });
        setTimeout(() => target.deleteReply().catch(() => {}), 5000);
      } else {
        await target.reply(errorMsg);
      }
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`music_select_${author.id}`)
      .setPlaceholder("Select a track...")
      .addOptions(
        results.slice(0, 5).map((r) => ({
          label:
            r.title.length > 100 ? r.title.substring(0, 97) + "..." : r.title,
          description: r.uploader ? `By ${r.uploader}` : "",
          value: `${r.webpage_url}|${r.title.substring(0, 50)}`,
        })),
      );

    const row = new ActionRowBuilder().addComponents(menu);

    const content = `*Found ${results.length} results for: ${query} (YTM)*`;
    if (isInteraction) {
      await target.editReply({
        content: `*Found ${results.length} results. Select one within 45 seconds:*`,
        components: [row],
      });
      setTimeout(() => target.deleteReply().catch(() => {}), 45000);
    } else {
      await target.reply({ content, components: [row] });
    }
    return;
  }

  if (!url) return;

  await player.play(target, url, query);
}

module.exports = {
  musicHandler,
  player,
};
