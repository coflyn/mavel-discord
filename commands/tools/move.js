const { EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("../../config");

module.exports = {
  name: "move",
  async execute(interaction, client) {
    const botUser = await interaction.client.user.fetch();
    const botBanner = botUser.bannerURL({ dynamic: true, size: 1024 });
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands`;

    const LINK = interaction.guild.emojis.cache.find((e) => e.name === "blue_arrow_right")?.toString() || "➡";
    const PC = interaction.guild.emojis.cache.find((e) => e.name === "pc")?.toString() || "💻";
    const ARROW = interaction.guild.emojis.cache.find((e) => e.name === "arrow")?.toString() || "•";

    const moveEmbed = new EmbedBuilder()
      .setColor("#d63031")
      .setTitle("*Invite MaveL to another Server*")
      .setImage(botBanner)
      .setDescription(
        `### ${LINK} **Connection Success**\n` +
          `*To add MaveL to a different server, use the invite link below.*\n\n` +
          `${PC} [Add MaveL to another server](${inviteUrl})\n\n` +
          `**Setup Checklist:**\n` +
          `${ARROW} *Run **\`/emoji needs\`** to sync custom emojis.*\n` +
          `${ARROW} *Run **\`/setup\`** to get everything ready.*\n` +
          `${ARROW} *Run **\`/cookies\`** for premium downloads.*`,
      )
      .setFooter({ text: "MaveL System" });

    await interaction.reply({
      embeds: [moveEmbed],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
