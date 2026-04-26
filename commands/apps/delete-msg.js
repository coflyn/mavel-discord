const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");
const { advanceLog } = require("../../utils/logger");

module.exports = {
  name: "app_delete",
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
       return interaction.reply({
         content: "*Error: You need `Manage Messages` permission to use this.*",
         flags: [MessageFlags.Ephemeral]
       });
    }

    const msg = interaction.targetMessage;
    const FIRE = resolveEmoji(interaction.guild, "purple_fire", "🔥");

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      await msg.delete();
      await interaction.editReply({ content: `### ${FIRE} **Message Deleted**\nSuccessfully removed the message.` });

      advanceLog(interaction.client, {
        type: "error",
        title: "App Message Purge",
        activity: "Admin Actions",
        message: `Admin forcefully deleted a message via Apps.`,
        user: `${interaction.user.tag} (${interaction.user.id})`,
        guild: interaction.guild.name,
        extra:
          `**Target Author:** ${msg.author.tag}\n` +
          `**Channel:** <#${interaction.channel.id}>\n` +
          `**Content Snapshot:** \`\`\`\n${msg.content ? msg.content.substring(0, 100) : "Media / No Text"}\n\`\`\``
      });

    } catch (e) {
      await interaction.editReply({ content: `*Failed to delete message. Might be missing permissions or message is older than 14 days.*` });
    }
  }
};
