const cloudscraper = require("cloudscraper");
const { createJob, createHandlerContext } = require("./core-helpers");

async function runNSrvFlow(target, url, options = {}) {
  const ctx = createHandlerContext(target, options);
  let finalUrl = url.replace("cin.mom", "nhentai.net");
  url = finalUrl;
  const BOOK = ctx.getEmoji("camera", "📖");

  await ctx.init("Searching...", "Looking for the book...");

  try {
    const idMatch = url.match(/g\/(\d+)/) || url.match(/(\d+)/);
    if (!idMatch) throw new Error("Invalid resource ID.");
    const id = idMatch[1];

    await ctx.editResponse({
      embeds: [ctx.statusEmbed("Searching...", "Finding the book...")],
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

    const jobId = createJob(target, {
      url,
      title,
      stats: { pages: totalPages, type: "Archive" },
      thumbnail: `https://t.nhentai.net/galleries/${mediaId}/1t.jpg`,
      platform: "nhentai",
      isGallery: true,
      imageUrls: imageUrls,
    });

    const doneEmbed = ctx.statusEmbed(
      "Found it!",
      `${BOOK} **${title}**\n${ctx.ARROW} Total Pages: **${totalPages}**\n\n*Getting everything ready...*`,
    );
    await ctx.editResponse({ embeds: [doneEmbed] });

    return { jobId, statusMsg: ctx.statusMsg };
  } catch (e) {
    console.error("[NSRV-FLOW] Error:", e.message);
    await ctx.editResponse({
      embeds: [
        ctx.statusEmbed(
          "Request Failed",
          "We couldn't get the book. Please try again later.",
        ),
      ],
    });
    return null;
  }
}

module.exports = { runNSrvFlow };
