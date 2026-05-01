const { SlashCommandBuilder } = require("discord.js");
const ssHandler = require("../../handlers/tools/ss");

module.exports = {
  slashData: new SlashCommandBuilder()
      .setName("ss")
      .setDescription("Capture a high-quality screenshot of any website")
      .addStringOption((opt) =>
        opt.setName("url").setDescription("The website URL").setRequired(true),
      )
      .addBooleanOption((opt) =>
        opt
          .setName("full")
          .setDescription("Capture the entire scrollable page? (Default: False)")
          .setRequired(false),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("wait")
          .setDescription("Seconds to wait before capturing (1-10s)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((opt) =>
        opt
          .setName("device")
          .setDescription("Choose a device viewport")
          .setRequired(false)
          .addChoices(
            { name: "Desktop (1280x720)", value: "desktop" },
            { name: "Tablet (768x1024)", value: "tablet" },
            { name: "Mobile (375x667)", value: "mobile" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("theme")
          .setDescription("Choose a color scheme")
          .setRequired(false)
          .addChoices(
            { name: "Light Mode", value: "light" },
            { name: "Dark Mode", value: "dark" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("selector")
          .setDescription("Capture a specific element (CSS Selector)")
          .setRequired(false),
      ),
  name: "ss",
  async execute(interaction, client) {
    return await ssHandler(interaction);
  },
};
