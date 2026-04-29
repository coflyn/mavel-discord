const { 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const { resolveEmoji } = require("../../utils/emoji-helper");

module.exports = {
  name: "room",
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;
    const client = interaction.client;

    const getEmoji = (name, fallback) => resolveEmoji(guild, name, fallback);
    const FIRE = getEmoji("purple_fire", "🔥");
    const ARROW = getEmoji("arrow", "»");
    const NOTIF = getEmoji("notif", "🔔");
    const LEA = getEmoji("lea", "✅");
    const E_SUCCESS = getEmoji("ping_green", "✅");
    const E_ERROR = getEmoji("ping_red", "❌");

    if (subcommand === "create") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      try {
        const channelName = `🔒・room-${user.username.toLowerCase().substring(0, 15)}`;
        
        const existingChannel = guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
          return interaction.editReply({
            content: `### ${E_ERROR} **You already have an active room!**\n${ARROW} Go to: ${existingChannel}`
          });
        }

        const roomChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          nsfw: true,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ],
            },
            {
              id: client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageMessages
              ],
            },
          ],
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticket_add_${user.id}`).setLabel("Add User").setEmoji("👤").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ticket_remove_${user.id}`).setLabel("Remove User").setEmoji("🚫").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ticket_close_${user.id}`).setLabel("Finish").setEmoji("🔒").setStyle(ButtonStyle.Danger)
        );

        const introEmbed = new EmbedBuilder()
          .setColor("#6c5ce7")
          .setTitle(`${LEA} **Private Download Room**`)
          .setDescription(
            `### ${FIRE} **Welcome, ${user.username}!**\n` +
            `${ARROW} This is your private space for downloads.\n` +
            `${ARROW} Other users can see this room in \`/room list\` and request to join.`
          )
          .setFooter({ text: "MaveL Privacy Protection", iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await roomChannel.send({ content: `${user}`, embeds: [introEmbed], components: [row] });
        await interaction.editReply({ content: `### ${NOTIF} **Room Created!**\nGo to: ${roomChannel}` });

      } catch (e) {
        console.error("[ROOM-CREATE]", e);
        await interaction.editReply({ content: `*Error: ${e.message}*` });
      }
    }

    if (subcommand === "list") {
      const selfRoomName = `🔒・room-${user.username.toLowerCase().substring(0, 15)}`;
      const rooms = guild.channels.cache.filter(c => 
        c.name.startsWith("🔒・room-") && c.name !== selfRoomName
      );
      
      if (rooms.size === 0) {
        const hasSelfRoom = guild.channels.cache.find(c => c.name === selfRoomName);
        return interaction.reply({
          content: hasSelfRoom 
            ? "### 🔒 **No other rooms found.**\n> *You are the only one with an active room right now.*"
            : "### 🔒 **No active rooms found.**\nCreate one with `/room create`!",
          flags: [MessageFlags.Ephemeral]
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#6c5ce7")
        .setTitle(`🔒 **Active Download Rooms**`)
        .setDescription("*Select a room below to request access from the owner.*")
        .setTimestamp();

      const ARROW_EMOJI = getEmoji("arrow", "»");

      const options = rooms.map(c => {
        const ownerName = c.name.replace("🔒・room-", "");
        return {
          label: `Room: ${ownerName}`,
          description: `Click to request access to this room`,
          value: c.id,
          emoji: ARROW_EMOJI
        };
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("room_request_join")
        .setPlaceholder("Choose a room to join...")
        .addOptions(options.slice(0, 25));

      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }
  }
};
