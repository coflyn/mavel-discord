const { MessageFlags } = require("discord.js");
const { runYtDlpFlow } = require("./core");
const { handleDownloadCallback } = require("./callbacks");
const config = require("../../config");

module.exports = async function downloaderHandler(target, manualOptions = {}) {
  let url = manualOptions.manualUrl || "";
  let type = manualOptions.manualType || null;
  let resolution = manualOptions.manualResolution || null;

  if (manualOptions.manualUrl) {
    type = manualOptions.manualType || "mp4";
    resolution = manualOptions.manualResolution || "720";
  } else if (
    target.options &&
    target.isChatInputCommand &&
    target.isChatInputCommand()
  ) {
    url = target.options.getString("url");
    type = target.options.getString("type") || "mp4";
    resolution = target.options.getString("resolution") || "720";
  } else {
    const text = target.content || "";
    if (!text) return;
    const linkMatch = text.match(/https?:\/\/[^\s]+/);
    if (!linkMatch) return;
    url = linkMatch[0];

    type = "mp4";
    resolution = "720";
  }

  if (!url) {
    const platformList = [
      "*MaveL Supported Platforms:*",
      "> *Video/Socials: TikTok, Instagram, YouTube, FB, X, Threads*",
      "> *Creative/Art: Pinterest, Pixiv, Wallhaven*",
      "> *Music/Audio: YouTube Music, SoundCloud, Spotify*",
      "> *File Storage: Mediafire, MEGA, GDrive*",
      "> *Documents: Slideshare, Docplayer*",
    ].join("\n");

    if (target.reply) {
      const reply = await target.reply({
        content: platformList,
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });
      setTimeout(() => {
        if (target.deleteReply) target.deleteReply().catch(() => {});
        else if (reply && reply.delete) reply.delete().catch(() => {});
      }, 60000);
      return;
    }
    return;
  }

  await runYtDlpFlow(target, url, { type, resolution });
};

module.exports.handleDownloadCallback = handleDownloadCallback;
module.exports.runYtDlpFlow = runYtDlpFlow;
