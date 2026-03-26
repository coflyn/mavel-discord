const {
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { REQUIRED_EMOJIS } = require("../../utils/emoji-registry");

module.exports = async function emojiHandler(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (interaction.deferReply && (subcommand !== "add")) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
  }

  if (subcommand === "add") {
    return handleAdd(interaction);
  } else if (subcommand === "delete") {
    return handleDelete(interaction);
  } else if (subcommand === "rename") {
    return handleRename(interaction);
  } else if (subcommand === "info") {
    return handleInfo(interaction);
  } else if (subcommand === "list") {
    return handleList(interaction);
  } else if (subcommand === "needs") {
    return handleNeeds(interaction);
  }
};

async function handleAdd(interaction) {
  const input = interaction.options.getString("input");
  const rawName = interaction.options.getString("name");

  const name = rawName.replace(/\s+/g, "_").replace(/[^\w]/g, "");

  if (!name || name.length < 2) {
    return interaction.reply({
      content:
        "*Invalid emoji name. Please use at least 2 alphanumeric characters.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  if (!interaction.member.permissions.has("ManageGuildExpressions")) {
    return interaction.reply({
      content: "*You do not have permission to manage emojis.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let emojiId = input;
  if (input.includes("/")) {
    emojiId = input.split("/").pop().split(".")[0];
  }
  if (input.includes(":")) {
    emojiId = input.split(":").pop().replace(">", "");
  }

  const animatedUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?quality=lossless`;
  const staticUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?quality=lossless`;

  try {
    const fetchOptions = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
    };

    let response = await fetch(animatedUrl, fetchOptions);
    if (!response.ok) {
      response = await fetch(staticUrl, fetchOptions);
    }

    if (!response.ok) {
      return interaction.editReply(
        "*Could not find a valid emoji with that ID or Link.*",
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const emoji = await interaction.guild.emojis.create({
      attachment: buffer,
      name: name,
    });

    await interaction.editReply(
      `*Successfully added emoji:* ${emoji.toString()} *as* \`${name}\``,
    );
  } catch (err) {
    console.error("[EMOJI-ADD] Error:", err.message);
    await interaction.editReply(`*Failed to add emoji: ${err.message}*`);
  }
}

async function handleDelete(interaction) {
  if (!interaction.member.permissions.has("ManageGuildExpressions")) {
    return interaction.reply({
      content: "*You do not have permission to manage emojis.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const query = interaction.options.getString("query");
  const emojis = await interaction.guild.emojis.fetch();
  const target = emojis.find((e) => e.name === query || e.id === query);

  if (!target) {
    return interaction.reply({
      content: "*Emoji not found in this server.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  try {
    const emojiName = target.name;
    await target.delete();
    await interaction.editReply({
      content: `*Successfully deleted emoji:* \`${emojiName}\``,
    });
  } catch (err) {
    await interaction.editReply({
      content: `*Failed to delete emoji: ${err.message}*`,
    });
  }
}

async function handleRename(interaction) {
  if (!interaction.member.permissions.has("ManageGuildExpressions")) {
    return interaction.reply({
      content: "*You do not have permission to manage emojis.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const current = interaction.options.getString("current");
  const newNameRaw = interaction.options.getString("new");
  const newName = newNameRaw.replace(/\s+/g, "_").replace(/[^\w]/g, "");

  const emojis = await interaction.guild.emojis.fetch();
  const target = emojis.find((e) => e.name === current || e.id === current);

  if (!target) {
    return interaction.reply({
      content: "*Emoji not found in this server.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  try {
    const oldName = target.name;
    await target.setName(newName);
    await interaction.editReply({
      content: `*Successfully renamed emoji from* \`${oldName}\` *to* \`${newName}\` ${target.toString()}`,
    });
  } catch (err) {
    await interaction.editReply({
      content: `*Failed to rename emoji: ${err.message}*`,
    });
  }
}

async function handleInfo(interaction) {
  const rawEmoji = interaction.options.getString("emoji");
  let emojiId = rawEmoji;

  if (rawEmoji.includes(":")) {
    emojiId = rawEmoji.split(":").pop().replace(">", "");
  }

  const animatedUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?quality=lossless`;
  const staticUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?quality=lossless`;

  const fetchOptions = {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  };

  let response = await fetch(animatedUrl, fetchOptions);
  const isAnimated = response.ok;
  const finalUrl = isAnimated ? animatedUrl : staticUrl;

  const AMOGUS =
    (await interaction.guild.emojis.fetch())
      .find((e) => e.name === "amogus")
      ?.toString() || "🔎";
  const ARROW =
    (await interaction.guild.emojis.fetch())
      .find((e) => e.name === "arrow")
      ?.toString() || "•";

  const embed = new EmbedBuilder()
    .setColor("#6c5ce7")
    .setTitle("*Emoji Intelligence Report*")
    .setDescription(
      `${ARROW} *Target ID: \`${emojiId}\`*\n${ARROW} *Type: ${isAnimated ? "Animated" : "Static"}*\n\n[Download High-Res Asset](${finalUrl})`,
    )
    .setThumbnail(finalUrl)
    .setFooter({ text: "MaveL Asset Identifier" });

  const res = await (interaction.deferred ? interaction.editReply({
    embeds: [embed],
  }) : interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
    withResponse: true,
  }));

  const reply = sent?.resource || sent;
  if (reply && reply.delete) {
    setTimeout(() => {
      if (interaction.isChatInputCommand?.()) {
        interaction.deleteReply().catch(() => {});
      } else {
        reply.delete().catch(() => {});
      }
    }, 60000);
  }
}

async function handleList(interaction) {
  const emojis = await interaction.guild.emojis.fetch();

  if (emojis.size === 0) {
    return interaction.reply({
      content: "*No custom emojis found in this server.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const ARROW =
    (await interaction.guild.emojis.fetch())
      .find((e) => e.name === "arrow")
      ?.toString() || "•";
  const list = emojis
    .map((e) => `${ARROW} ${e.toString()} \`${e.name}\` (ID: \`${e.id}\`)`)
    .join("\n");

  if (list.length > 3900) {
    const chunks = list.match(/[\s\S]{1,3900}/g);
    await interaction.reply({
      content:
        "*Synchronizing asset list (Excessive data detected, splitting logs)...*",
      flags: [MessageFlags.Ephemeral],
    });

    for (const chunk of chunks) {
      const embed = new EmbedBuilder()
        .setColor("#6c5ce7")
        .setTitle("*Server Asset Registry*")
        .setDescription(chunk);
      const res = await interaction.followUp({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      });

      const reply = res?.resource || res;
      if (reply && reply.delete) {
        setTimeout(() => {
          reply.delete().catch(() => {});
        }, 120000);
      }
    }
  } else {
    const embed = new EmbedBuilder()
      .setColor("#6c5ce7")
      .setTitle("*Server Asset Registry*")
      .setDescription(list)
      .setFooter({ text: `Total Assets: ${emojis.size}` });

    const sent = await (interaction.deferred ? interaction.editReply({
      embeds: [embed],
    }) : interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
      withResponse: true,
    }));

    const response = sent?.resource || sent;
    if (response && response.delete) {
      setTimeout(() => {
        if (interaction.isChatInputCommand?.()) {
          interaction.deleteReply().catch(() => {});
        } else {
          response.delete().catch(() => {});
        }
      }, 120000);
    }
  }
}

async function handleNeeds(interaction) {
  const guildEmojis = await interaction.guild.emojis.fetch();
  const missing = REQUIRED_EMOJIS.filter(
    (req) => !guildEmojis.some((e) => e.name === req.name),
  );

  const getEmoji = (name, fallback) =>
    guildEmojis.find((e) => e.name === name)?.toString() || fallback;

  const ARROW = getEmoji("arrow", "•");
  const AMOGUS = getEmoji("amogus", "🛰️");
  const PC = getEmoji("pc", "💻");
  const CAMERA = getEmoji("camera", "🛰️");
  const DIAMOND = getEmoji("diamond", "✨");
  const ROCKET = getEmoji("rocket", "🚀");
  const CHECK = getEmoji("check", "✅");
  const CROSS = getEmoji("ping_red", "🔴");

  const embed = new EmbedBuilder()
    .setColor("#6c5ce7")
    .setTitle("*System Emoji Diagnostics*")
    .setDescription(
      REQUIRED_EMOJIS.map((req) => {
        const exists = guildEmojis.some((e) => e.name === req.name);
        return `${ARROW} \`${req.name}\`: ${exists ? CHECK : CROSS}`;
      }).join("\n"),
    );

  if (missing.length > 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sync_emojis")
        .setLabel(`Synchronize Assets (${missing.length} missing)`)
        .setStyle(ButtonStyle.Primary),
    );

    return (interaction.deferred ? interaction.editReply({
      embeds: [embed],
      components: [row],
    }) : interaction.reply({
      embeds: [embed],
      components: [row],
      flags: [MessageFlags.Ephemeral],
    }));
  } else {
    return (interaction.deferred ? interaction.editReply({
      embeds: [embed],
      content: "*All required system assets are currently synchronized.*",
    }) : interaction.reply({
      embeds: [embed],
      content: "*All required system assets are currently synchronized.*",
      flags: [MessageFlags.Ephemeral],
    }));
  }
}

module.exports.syncMissingEmojis = async function (interaction) {
  if (!interaction.member.permissions.has("ManageGuildExpressions")) {
    return interaction.reply({
      content: "*You do not have permission to manage emojis.*",
      flags: [MessageFlags.Ephemeral],
    });
  }

  await interaction.deferUpdate();

  const guildEmojis = await interaction.guild.emojis.fetch();
  const missing = REQUIRED_EMOJIS.filter(
    (req) => !guildEmojis.some((e) => e.name === req.name),
  );

  const PING_GREEN =
    guildEmojis.find((e) => e.name === "ping_green")?.toString() || "🟢";
  const PING_RED =
    guildEmojis.find((e) => e.name === "ping_red")?.toString() || "🔴";

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor("#6c5ce7")
        .setDescription(
          `### ⏳ **Synthesizing Assets...**\n*Please wait while MaveL retrieves **${missing.length}** sector data units.*`,
        ),
    ],
    components: [],
  });

  let successCount = 0;
  let failCount = 0;

  for (const req of missing) {
    const emojiId = req.id;
    const animatedUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?quality=lossless`;
    const staticUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?quality=lossless`;
    const fetchOptions = { headers: { "User-Agent": "Mozilla/5.0" } };

    try {
      let response = await fetch(animatedUrl, fetchOptions);
      if (!response.ok) response = await fetch(staticUrl, fetchOptions);

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await interaction.guild.emojis.create({
          attachment: buffer,
          name: req.name,
        });
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor("#6c5ce7")
    .setTitle("*Asset Synchronization Report*")
    .setDescription(
      `### ${successCount > 0 ? PING_GREEN : PING_RED} **Sync Complete**\n*Successfully synthesized **${successCount}** assets.*\n*Failed to retrieve **${failCount}** assets.*`,
    );

  await interaction.editReply({
    embeds: [embed],
    components: [],
  });
};
