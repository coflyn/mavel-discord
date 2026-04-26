const cloudscraper = require("cloudscraper");
const { resolveEmoji } = require("../../utils/emoji-helper");
const {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
} = require("../../utils/response-helper");
const { loadDB, saveDB } = require("./core-helpers");

async function runNSrvFlow(target, url, options = {}) {
  let finalUrl = url.replace("cin.mom", "nhentai.net");
  url = finalUrl;
  const guild = target.guild || target.client?.guilds?.cache.first();
  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const ARROW = getEmoji("arrow", "•");
  const BOOK = getEmoji("camera", "📖");

  let statusMsg;
  const _editResponse = async (data) =>
    await editResponse(target, statusMsg, data);

  if (options.statusMsg) {
    statusMsg = options.statusMsg;
  } else {
    statusMsg = await sendInitialStatus(
      target,
      "Searching...",
      "Looking for the book...",
    );
  }

  try {
    const idMatch = url.match(/g\/(\d+)/) || url.match(/(\d+)/);
    if (!idMatch) throw new Error("Invalid resource ID.");
    const id = idMatch[1];

    await _editResponse({
      embeds: [getStatusEmbed(guild, "Searching...", "Finding the book...")],
    });

    const resp = await cloudscraper.get(
      `https://nhentai.net/api/v2/galleries/${id}`,
    );
    const data = typeof resp === "string" ? JSON.parse(resp) : resp;

    if (!data || !data.media_id)
      throw new Error("The server refused the request. (API V2 Error)");

    const mediaId = data.media_id;
    const title =
      data.title.pretty || data.title.english || "Archived Material";

    const pages = data.pages || [];
    const totalPages = pages.length;

    if (totalPages === 0) throw new Error("No pages found in this gallery.");

    const imageUrls = pages.map((p, i) => {
      const ext = p.path ? p.path.split(".").pop() : "jpg";
      return `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`;
    });

    const jobId = Math.random().toString(36).substring(2, 10);
    const db = loadDB();
    db.jobs[jobId] = {
      url,
      timestamp: Date.now(),
      title,
      stats: { pages: totalPages, type: "Archive" },
      thumbnail: `https://t.nhentai.net/galleries/${mediaId}/1t.jpg`,
      platform: "nhentai",
      userId: target.user ? target.user.id : target.author.id,
      isGallery: true,
      imageUrls: imageUrls,
    };
    saveDB(db);

    const doneEmbed = getStatusEmbed(
      guild,
      "Found it!",
      `${BOOK} **${title}**\n${ARROW} Total Pages: **${totalPages}**\n\n*Getting everything ready...*`,
    );
    await _editResponse({ embeds: [doneEmbed] });

    return { jobId, statusMsg };
  } catch (e) {
    console.error("[NSRV-FLOW] Error:", e.message);
    await _editResponse({
      embeds: [
        getStatusEmbed(
          guild,
          "Request Failed",
          "We couldn't get the book. Please try again later.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runNSrvFlow };
