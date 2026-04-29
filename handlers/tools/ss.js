const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const colors = require("../../utils/embed-colors");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = async function ssHandler(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const url = interaction.options.getString("url");
  const fullPage = interaction.options.getBoolean("full") || false;

  let targetUrl = url;
  if (!url.startsWith("http")) targetUrl = `https://${url}`;

  try {
    const rootTempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(rootTempDir))
      fs.mkdirSync(rootTempDir, { recursive: true });

    const outputName = `mave_ss_${Date.now()}.png`;
    const outputPath = path.join(rootTempDir, outputName);

    const getEmoji = (name, fallback) => resolveEmoji(interaction.guild, name, fallback);

    const E_TIME = getEmoji("time", "⏳");
    const E_SYNC = getEmoji("online", "🔄");
    const E_PC = getEmoji("pc", "💻");
    const E_ROCKET = getEmoji("rocket", "🚀");
    const E_PING_RED = getEmoji("ping_red", "🔴");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(colors.CORE)
          .setDescription(
            `### ${E_TIME} **Rendering Website...**\n*MaveL is launching a private browser to capture the requested page.*`,
          ),
      ],
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({ path: outputPath, fullPage: fullPage });
    await browser.close();

    const attachment = new AttachmentBuilder(outputPath, { name: outputName });
    const successEmbed = new EmbedBuilder()
      .setColor(colors.CORE)
      .setTitle(`${E_PC} Screenshot Captured`)
      .setDescription(
        `### ${E_ROCKET} **Mission Accomplished**\nCaptured: **${targetUrl.replace(/https?:\/\//, "")}**\nMode: \`${fullPage ? "Full Page" : "Desktop View"}\``,
      )
      .setImage(`attachment://${outputName}`);

    await interaction.editReply({
      content: null,
      embeds: [successEmbed],
      files: [attachment],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 120000);

    setTimeout(
      () => fs.existsSync(outputPath) && fs.unlinkSync(outputPath),
      5000,
    );
  } catch (err) {
    console.error("[SS] Error:", err.message);
    const pingRed = interaction.guild?.emojis.cache.find(e => e.name === "ping_red")?.toString() || "🔴";
    await interaction.editReply({
      content: `### ${pingRed} **Render Failed**\n> *Error: ${err.message}*\n> *Make sure the URL is valid and accessible.*`,
      embeds: [],
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }
};
