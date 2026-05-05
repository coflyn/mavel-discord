const http = require("../../utils/http");
const { EmbedBuilder, MessageFlags, AttachmentBuilder } = require("discord.js");
const colors = require("../../utils/embed-colors");
const { resolveEmoji } = require("../../utils/emoji-helper");
const config = require("../../config");
const { getPage } = require("../../utils/browser");
const fs = require("fs");
const path = require("path");
const { getTempDir } = require("../../utils/filetools");

module.exports = async function traceHandler(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let imageUrl = null;
  let mode = interaction.options?.getString("mode") || "anime";

  if (interaction.isChatInputCommand()) {
    const attachment = interaction.options.getAttachment("image");
    const urlOption = interaction.options.getString("url");
    imageUrl = attachment ? attachment.url : urlOption;
  } else if (interaction.isMessageContextMenuCommand()) {
    const commandName = interaction.commandName;
    if (commandName === "Trace Movie") mode = "movie";
    else mode = "anime";

    const message = interaction.targetMessage;
    const attachment = message.attachments.first();
    const botBanner = config.botBanner || "";

    if (attachment) {
      if (attachment.contentType?.startsWith("image/")) {
        imageUrl = attachment.url;
      } else if (attachment.contentType?.startsWith("video/")) {
        imageUrl = attachment.proxyURL || attachment.url;
      }
    }

    if (!imageUrl) {
      const validEmbed = message.embeds.find((e) => {
        const url = e.image?.url || e.thumbnail?.url;
        return url && (!botBanner || !url.includes(botBanner));
      });
      if (validEmbed) {
        imageUrl = validEmbed.image?.url || validEmbed.thumbnail?.url;
      }
    }
  }

  const getEmoji = (name, fallback) =>
    resolveEmoji(interaction, name, fallback);
  const E_TIME = getEmoji("time", "⏳");
  const E_SEARCH = getEmoji("lea", "🔎");
  const E_PING_RED = getEmoji("ping_red", "🔴");
  const ARROW = getEmoji("arrow", "•");
  const E_ROCKET = getEmoji("rocket", "🚀");

  if (!imageUrl) {
    await interaction.editReply({
      content: `### ${E_PING_RED} **Trace Failed**\n> *No valid image found to trace. Please provide an image attachment or URL.*`,
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  try {
    const embed = new EmbedBuilder()
      .setColor(colors.SEARCH)
      .setDescription(
        `### ${E_TIME} **Tracing ${mode === "anime" ? "Anime" : "Movie/Scene"}...**\n` +
          `*MaveL is searching for matches in the ${mode === "anime" ? "Anime database" : "Global image database"}.*`,
      );

    await interaction.editReply({ embeds: [embed] });

    if (mode === "anime") {
      const response = await http.get(
        `https://api.trace.moe/search?url=${encodeURIComponent(imageUrl)}`,
      );
      const data = response.data;

      if (!data.result || data.result.length === 0) {
        throw new Error("No matches found in the Anime database.");
      }

      const bestMatch = data.result[0];
      const { filename, episode, from, to, similarity, image } = bestMatch;

      const percentage = (similarity * 100).toFixed(2);
      const timestamp = new Date(from * 1000).toISOString().substr(11, 8);

      const successEmbed = new EmbedBuilder()
        .setColor(colors.SEARCH)
        .setTitle(`${E_SEARCH} Anime Identified`)
        .setURL(`https://anilist.co/anime/${bestMatch.anilist}`)
        .setDescription(
          `### **Match Found: ${percentage}% Confidence**\n` +
            `${ARROW} **Title:** \`${filename}\`\n` +
            `${ARROW} **Episode:** \`${episode || "N/A"}\`\n` +
            `${ARROW} **Timestamp:** \`${timestamp}\`\n` +
            `\n*MaveL found a high-confidence match for this frame.*`,
        )
        .setImage(image)
        .setThumbnail(imageUrl)
        .setFooter({ text: "Trace.moe Anime Search" })
        .setTimestamp();

      return await interaction.editReply({ embeds: [successEmbed] });
    } else {
      let page;
      try {
        page = await getPage({
          userAgent: http.getUserAgent("desktop"),
          viewport: { width: 1280, height: 900 },
          deviceScaleFactor: 1,
        });

        const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
        await page
          .goto(lensUrl, { waitUntil: "networkidle", timeout: 40000 })
          .catch(() => {});

        const consentButton = await page.$(
          'button:has-text("Accept all"), button:has-text("I agree"), [aria-label="Accept all"]',
        );
        if (consentButton) {
          await consentButton.click();
          await page
            .waitForNavigation({ waitUntil: "networkidle" })
            .catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 5000));

        let results = await page.evaluate(() => {
          const findTitles = () => {
            const selectors = [
              'div[role="listitem"] div[dir="ltr"]',
              "[data-item-title]",
              "h3",
              ".VfPpkd-vQESRE-OWXEXe-p68vlb",
              'div[jsname="V67oY"]',
            ];

            let found = [];
            selectors.forEach((sel) => {
              const elements = document.querySelectorAll(sel);
              elements.forEach((el) => {
                const txt = el.innerText.trim();
                if (txt.length > 3 && txt.length < 80 && !found.includes(txt)) {
                  found.push(txt);
                }
              });
            });

            if (found.length === 0) {
              const allDivs = Array.from(
                document.querySelectorAll("div, span"),
              );
              allDivs.forEach((div) => {
                const txt = div.innerText.trim();
                if (
                  txt.length > 10 &&
                  txt.length < 60 &&
                  /^[A-Z0-9]/.test(txt)
                ) {
                  if (
                    !txt.includes("Google") &&
                    !txt.includes("Privacy") &&
                    !txt.includes("Terms")
                  ) {
                    found.push(txt);
                  }
                }
              });
            }

            return found.slice(0, 8);
          };
          return findTitles().map((t) => ({ title: t, source: "Google Lens" }));
        });

        if (results.length < 2) {
          const yandexUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`;
          await page
            .goto(yandexUrl, { waitUntil: "networkidle", timeout: 30000 })
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));

          const yanResults = await page.evaluate(() => {
            const titles = Array.from(
              document.querySelectorAll(
                ".CbirItem-Title, .CbirOtherSizes-Title, .CbirPage-Title",
              ),
            );
            return titles
              .map((el) => el.innerText.trim())
              .filter((txt) => txt.length > 3)
              .slice(0, 5)
              .map((t) => ({ title: t, source: "Yandex Search" }));
          });
          results = [...results, ...yanResults];
        }

        if (results.length === 0) {
          throw new Error(
            "MaveL couldn't find a clear match on Google or Yandex. The image might be too new or unique.",
          );
        }

        const bestResult = results[0];
        const tempDir = getTempDir();
        const proofName = `trace_proof_${Date.now()}.png`;
        const proofPath = path.join(tempDir, proofName);

        await page
          .screenshot({ path: proofPath, fullPage: false })
          .catch(() => {});

        const resultEmbed = new EmbedBuilder()
          .setColor(colors.SEARCH)
          .setTitle(`${E_SEARCH} Scene Identified`)
          .setDescription(
            `### ${E_ROCKET} **Search Finished**\n` +
              `${ARROW} **Potential Title:** \`${bestResult.title}\`\n` +
              `${ARROW} **Best Match Source:** *${bestResult.source}*\n\n` +
              `**Alternative Matches:**\n` +
              results
                .slice(1, 6)
                .map((r, i) => `${i + 2}. \`${r.title}\` (*${r.source}*)`)
                .join("\n"),
          )
          .setThumbnail(imageUrl)
          .setFooter({ text: "Multi-Source Visual Search (Google + Yandex)" })
          .setTimestamp();

        const files = [];
        if (fs.existsSync(proofPath)) {
          const attachment = new AttachmentBuilder(proofPath, {
            name: proofName,
          });
          resultEmbed.setImage(`attachment://${proofName}`);
          files.push(attachment);
        }

        await interaction.editReply({ embeds: [resultEmbed], files });

        if (fs.existsSync(proofPath)) {
          setTimeout(() => fs.unlinkSync(proofPath), 15000);
        }
      } finally {
        if (page) await page.close();
      }
    }

    setTimeout(() => interaction.deleteReply().catch(() => {}), 300000);
  } catch (err) {
    console.error("[TRACE-FATAL]", err.message);
    await interaction.editReply({
      content: `### ${E_PING_RED} **Trace Failed**\n> *Details: ${err.message}*`,
      embeds: [],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }
};
