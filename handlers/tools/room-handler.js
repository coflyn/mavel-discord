const {
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

module.exports = async function handleTicketInteraction(interaction) {
  const { customId, guild, channel, user, client } = interaction;

  const parts = customId.split("_");
  const isMenu = parts.includes("select");
  const action = isMenu ? parts[2] : parts[1];
  const ownerId = parts[parts.length - 1];

  if (
    user.id !== ownerId &&
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    await interaction.reply({
      content: "*Error: Only the room owner can use these controls.*",
      flags: [MessageFlags.Ephemeral],
    });
    return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  }

  if (!isMenu) {
    if (action === "close") {
      await interaction.reply({ content: "🔒 *Closing room in 5 seconds...*" });
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }

    if (action === "add") {
      const select = new UserSelectMenuBuilder()
        .setCustomId(`ticket_select_add_${ownerId}`)
        .setPlaceholder("Select a user to ADD")
        .setMinValues(1)
        .setMaxValues(1);

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({
        content: "👤 **Who do you want to add to this room?**",
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    }

    if (action === "remove") {
      const membersWithAccess = [];
      channel.permissionOverwrites.cache.forEach((overwrite) => {
        if (
          overwrite.type === 1 &&
          overwrite.id !== ownerId &&
          overwrite.id !== client.user.id
        ) {
          membersWithAccess.push(overwrite.id);
        }
      });

      if (membersWithAccess.length === 0) {
        const { resolveEmoji } = require("../../utils/emoji-helper");
        const E_ERROR = resolveEmoji(guild, "ping_red", "❌");
        await interaction.reply({
          content: `${E_ERROR} **There are no other users in this room to remove.**`,
          flags: [MessageFlags.Ephemeral],
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }

      const options = await Promise.all(
        membersWithAccess.map(async (id) => {
          const u = await client.users.fetch(id).catch(() => null);
          return u
            ? { label: u.username, value: u.id, description: `ID: ${u.id}` }
            : null;
        }),
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_remove_${ownerId}`)
        .setPlaceholder("Select a user to REMOVE")
        .addOptions(options.filter((o) => o !== null));

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({
        content: "🚫 **Who do you want to remove from this room?**",
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    }
  }

  if (isMenu) {
    await interaction.deferUpdate();

    const isAdd = action === "add";
    const targetId = interaction.values[0];
    const targetUser = await client.users.fetch(targetId).catch(() => null);

    const { resolveEmoji } = require("../../utils/emoji-helper");
    const E_SUCCESS = resolveEmoji(guild, "ping_green", "✅");
    const E_ERROR = resolveEmoji(guild, "ping_red", "❌");

    if (!targetUser)
      return interaction.editReply({
        content: `${E_ERROR} *User not found.*`,
        components: [],
      });

    try {
      if (isAdd) {
        await channel.permissionOverwrites.edit(targetId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        });
        await interaction.editReply({
          content: `${E_SUCCESS} **Added ${targetUser.username} to the room.**`,
          components: [],
        });
        await channel.send({
          content: `🔔 ${targetUser} has been added to this room by ${user}.`,
        });
      } else {
        if (targetId === ownerId || targetId === client.user.id) {
          return interaction.editReply({
            content: `${E_ERROR} *You cannot remove yourself or the bot!*`,
            components: [],
          });
        }
        await channel.permissionOverwrites.delete(targetId);
        await interaction.editReply({
          content: `${E_SUCCESS} **Removed ${targetUser.username} from the room.**`,
          components: [],
        });
        await channel.send({
          content: `🚫 ${targetUser} has been removed from this room.`,
        });
      }
    } catch (e) {
      await interaction.editReply({
        content: `### ${E_ERROR} *Error: ${e.message}*`,
        components: [],
      });
    }
  }

  if (customId.startsWith("room_")) {
    const action = parts[1];

    if (action === "request") {
      await interaction.deferUpdate();
      const targetRoomId = interaction.values[0];
      const targetChannel = guild.channels.cache.get(targetRoomId);

      if (!targetChannel) {
        const { resolveEmoji } = require("../../utils/emoji-helper");
        const E_ERROR = resolveEmoji(guild, "ping_red", "❌");
        return interaction.editReply({
          content: `${E_ERROR} *Room no longer exists.*`,
          components: [],
        });
      }

      if (
        targetChannel.permissionsFor(user).has(PermissionFlagsBits.ViewChannel)
      ) {
        const { resolveEmoji } = require("../../utils/emoji-helper");
        const E_INFO = resolveEmoji(guild, "pc", "💡");
        return interaction.editReply({
          content: `### ${E_INFO} **Access Notice**\n${user}, you already have full access to this room! Check your channel list.`,
          components: [],
        });
      }

      const { resolveEmoji } = require("../../utils/emoji-helper");
      const NOTIF_EMOJI = resolveEmoji(guild, "notif", "🔔");

      const ownerName = targetChannel.name.replace("📁・room-", "");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`room_accept_${user.id}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`room_reject_${user.id}`)
          .setLabel("Reject")
          .setStyle(ButtonStyle.Danger),
      );

      const requestEmbed = new EmbedBuilder()
        .setColor(colors.HELP)
        .setTitle(`${NOTIF_EMOJI} **Join Request**`)
        .setDescription(
          `### ${user} wants to join this room!\n*Owner, do you approve?*`,
        )
        .setTimestamp();

      await targetChannel.send({ embeds: [requestEmbed], components: [row] });
      await interaction.editReply({
        content: `${E_SUCCESS} **Request sent to ${ownerName}'s room!**`,
        embeds: [],
        components: [],
      });
    }

    if (action === "accept" || action === "reject") {
      const requesterId = parts[2];
      const requester = await client.users.fetch(requesterId).catch(() => null);

      const ownerMatch = channel.name.match(/room-(.+)/);
      const ownerName = ownerMatch ? ownerMatch[1] : "Unknown";

      const isOwner = channel
        .permissionsFor(user)
        .has(PermissionFlagsBits.ManageChannels);
      if (!isOwner) {
        const { resolveEmoji } = require("../../utils/emoji-helper");
        const E_ERROR = resolveEmoji(guild, "ping_red", "❌");
        await interaction.reply({
          content: `${E_ERROR} *Only the room owner can decide.*`,
          flags: [64],
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }

      const { resolveEmoji } = require("../../utils/emoji-helper");
const colors = require("../../utils/embed-colors");
      const E_SUCCESS = resolveEmoji(guild, "ping_green", "✅");
      const E_ERROR = resolveEmoji(guild, "ping_red", "❌");

      if (action === "accept") {
        await channel.permissionOverwrites.edit(requesterId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        });
        await interaction.update({
          content: `${E_SUCCESS} **Approved ${requester?.username || "user"}!**`,
          embeds: [],
          components: [],
        });
        if (requester)
          await requester
            .send(
              `${E_SUCCESS} Your request to join **${ownerName}'s Room** has been **APPROVED**!`,
            )
            .catch(() => {});
      } else {
        await interaction.update({
          content: `${E_ERROR} **Rejected ${requester?.username || "user"}.**`,
          embeds: [],
          components: [],
        });
        if (requester)
          await requester
            .send(
              `${E_ERROR} Your request to join **${ownerName}'s Room** has been **REJECTED**.`,
            )
            .catch(() => {});
      }
    }
  }
};
