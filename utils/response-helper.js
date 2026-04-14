const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveEmoji } = require("./emoji-helper");

const getStatusEmbed = (guild, status, details, color = "#6c5ce7") => {
  const fire = resolveEmoji(guild, "purple_fire", "🔥");
  const arrow = resolveEmoji(guild, "arrow", "•");

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(
      `### ${fire} **${status}**\n${arrow} **Details:** *${details}*`,
    );
};

const editResponse = async (target, statusMsg, data) => {
  try {
    const payload = typeof data === "string" ? { content: data } : data;
    if (target.editReply && (target.replied || target.deferred)) {
      return await target.editReply(payload);
    } else {
      const msg = statusMsg?.resource ? statusMsg.resource.message : statusMsg;
      if (msg && msg.edit) return await msg.edit(payload);
      if (target.channel) return await target.channel.send(payload);
    }
  } catch (e) {
    console.error("[RESPONSE-HELPER] Edit Error:", e.message);
  }
};

const sendInitialStatus = async (target, status, details) => {
  const embed = getStatusEmbed(target.guild, status, details);
  if (target.replied || target.deferred) {
    return await target.editReply({ embeds: [embed], withResponse: true });
  } else if (target.isChatInputCommand && target.isChatInputCommand()) {
    return await target.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    });
  } else {
    return target.reply
      ? await target.reply({ embeds: [embed], withResponse: true })
      : await target.channel.send({ embeds: [embed] });
  }
};

module.exports = {
  getStatusEmbed,
  editResponse,
  sendInitialStatus,
};
