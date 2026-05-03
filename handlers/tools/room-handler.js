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
const colors = require("../../utils/embed-colors");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = async function handleTicketInteraction(interaction) {
  const { customId, guild, channel, user, client } = interaction;

  const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
  const E_SUCCESS = getEmoji("ping_green", "✅");
  const E_ERROR = getEmoji("ping_red", "❌");
  const E_INFO = getEmoji("pc", "💡");
  const NOTIF_EMOJI = getEmoji("notif", "🔔");

  const parts = customId.split("_");
  const prefix = parts[0];
  const isMenu = parts.includes("select");
  const action = isMenu ? parts[2] : parts[1];
  const ownerId = parts[parts.length - 1];

  if (prefix === "ticket") {
    const isOwner = user.id === ownerId;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (action === "close") {
      if (!isOwner && !isAdmin) {
        await interaction.reply({
          content: `${E_ERROR} *Error: Only the room owner or an administrator can close this room.*`,
          flags: [MessageFlags.Ephemeral],
        });
        return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }
      await interaction.reply({ content: "🔒 *Closing room in 5 seconds...*" });
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }

    if (!isOwner) {
      await interaction.reply({
        content: `${E_ERROR} *Security Error: Only the room owner can manage members. Admins can only close the room.*`,
        flags: [MessageFlags.Ephemeral],
      });
      return setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }
  }

  if (!isMenu) {

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
        await interaction.reply({
          content: `${E_ERROR} **There are no other users in this room to remove.**`,
          flags: [MessageFlags.Ephemeral],
        });
        return setTimeout(
          () => interaction.deleteReply().catch(() => {}),
          10000,
        );
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
        return interaction.editReply({
          content: `${E_ERROR} *Room no longer exists.*`,
          components: [],
        });
      }

      if (
        targetChannel.permissionsFor(user).has(PermissionFlagsBits.ViewChannel)
      ) {
        return interaction.editReply({
          content: `### ${E_INFO} **Access Notice**\n${user}, you already have full access to this room! Check your channel list.`,
          components: [],
        });
      }

      const ownerName = targetChannel.name.replace("🔒・room-", "");

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

      const roomOwnerName = channel.name.split("-").pop();
      const isOwner = user.username.toLowerCase().includes(roomOwnerName) || 
                      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isOwner) {
        await interaction.reply({
          content: `${E_ERROR} *Security Notice: Only the room owner or an administrator can decide on join requests.*`,
          flags: [64],
        });
        return setTimeout(
          () => interaction.deleteReply().catch(() => {}),
          10000,
        );
      }

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
