const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const colors = require("../../utils/embed-colors");
const { resolveEmoji } = require("../../utils/emoji-helper");
const http = require("../../utils/http");

module.exports = async function ssHandler(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const url = interaction.options.getString("url");
  const fullPage = interaction.options.getBoolean("full") || false;
  const waitTime = (interaction.options.getInteger("wait") || 2) * 1000;
  const device = interaction.options.getString("device") || "desktop";
  const theme = interaction.options.getString("theme") || "light";
  const selector = interaction.options.getString("selector");

  let targetUrl = url;
  if (!url.startsWith("http")) targetUrl = `https://${url}`;

  const viewports = {
    desktop: { width: 1280, height: 720 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 },
  };

  try {
    const rootTempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(rootTempDir))
      fs.mkdirSync(rootTempDir, { recursive: true });

    const outputName = `screenshot_${Date.now()}.png`;
    const outputPath = path.join(rootTempDir, outputName);

    const getEmoji = (name, fallback) => resolveEmoji(interaction.guild, name, fallback);

    const E_TIME = getEmoji("time", "⏳");
    const E_PC = getEmoji("pc", "💻");
    const E_ROCKET = getEmoji("rocket", "🚀");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(colors.CORE)
          .setDescription(
            `### ${E_TIME} **Rendering Website...**\n` +
              `*Launching a private **${device}** browser in **${theme}** mode.*`,
          ),
      ],
    });

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-web-security', '--no-sandbox']
    });

    try {
      const context = await browser.newContext({
        viewport: viewports[device],
        deviceScaleFactor: 2,
        colorScheme: theme,
        userAgent: http.getUserAgent(device === "mobile" ? "mobile" : "desktop")
      });
      const page = await context.newPage();

      const response = await page.goto(targetUrl, { 
        waitUntil: "networkidle", 
        timeout: 45000 
      });

      if (!response) throw new Error("Target website returned no response.");
      if (response.status() >= 400) {
        throw new Error(`Website rejected access with Status Code: ${response.status()}`);
      }

      await new Promise((r) => setTimeout(r, waitTime));

      if (selector) {
        const element = await page.$(selector);
        if (element) {
          await element.screenshot({ path: outputPath });
        } else {
          throw new Error(`Element with selector \`${selector}\` not found.`);
        }
      } else {
        await page.screenshot({ path: outputPath, fullPage: fullPage });
      }

      const attachment = new AttachmentBuilder(outputPath, { name: outputName });
      const successEmbed = new EmbedBuilder()
        .setColor(colors.CORE)
        .setTitle(`${E_PC} Screenshot Captured`)
        .setDescription(
          `### ${E_ROCKET} **Mission Accomplished**\n` +
            `Captured: **${targetUrl.replace(/https?:\/\//, "")}**\n` +
            `Mode: \`${selector ? "Element Scan" : fullPage ? "Full Page" : "Standard View"}\`\n` +
            `Device: \`${device.toUpperCase()}\` | Theme: \`${theme.toUpperCase()}\``,
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
    } finally {
      await browser.close();
    }
  } catch (err) {
    let errorDetail = err.message;
    if (errorDetail.includes("timeout")) errorDetail = "Website took too long to respond (Timeout).";
    if (errorDetail.includes("ERR_NAME_NOT_RESOLVED")) errorDetail = "Invalid URL or Domain not found.";
    if (errorDetail.includes("ERR_CONNECTION_REFUSED")) errorDetail = "Website refused to connect.";
    
    console.error("[SS-FATAL]", err.message);
    const E_PING_RED = resolveEmoji(interaction.guild, "ping_red", "🔴");
    
    await interaction.editReply({
      content: `### ${E_PING_RED} **Render Failed**\n> *Details: ${errorDetail}*\n> *Make sure the URL is accessible without a VPN/Proxy.*`,
      embeds: [],
    }).catch(() => {});
    
    setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
  }
};
