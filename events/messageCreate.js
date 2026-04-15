const { MessageFlags, ChannelType } = require("discord.js");
const config = require("../config");
const downloaderHandler = require("../handlers/downloader");
const helpHandler = require("../handlers/tools/help");
const diagnosticsHandler = require("../handlers/tools/diagnostics");
const cookiesHandler = require("../handlers/tools/cookies");
const setupHandler = require("../handlers/tools/setup");
const infoHandler = require("../handlers/info");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot) return;

    const args = message.content.startsWith(config.prefix)
      ? message.content.slice(config.prefix.length).trim().split(/ +/)
      : [];
    const commandName = args.length > 0 ? args.shift().toLowerCase() : "";

    const isAllowed =
      !config.allowedChannelId ||
      message.channel.id === config.allowedChannelId;
    const isMusicChannel =
      config.musicChannelId && message.channel.id === config.musicChannelId;
    const isLogsChannel =
      config.logsChannelId && message.channel.id === config.logsChannelId;
    const isAdminChannel =
      config.adminChannelId && message.channel.id === config.adminChannelId;

    const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
    const isHelpRequest =
      commandName === "help" ||
      (message.mentions.has(client.user.id) && cleanContent.length === 0);

    if (isHelpRequest) {
      if (isAllowed || isMusicChannel || isLogsChannel || isAdminChannel) {
        return await helpHandler(message);
      }
    }

    if (!isAllowed && !isMusicChannel && !isLogsChannel && !isAdminChannel)
      return;

    if (message.content.match(/https?:\/\/[^\s]+/)) {
      try {
        const amogusEmoji = message.guild?.emojis.cache.find(
          (e) => e.name === "amogus",
        );
        await message.suppressEmbeds(true).catch(() => {});
        await message.react(amogusEmoji || "⏳").catch(() => {});
        return await downloaderHandler(message);
      } catch (e) {
        console.error("[LINK-HANDLER] Error:", e.message);
      }
    }

    if (!message.content.startsWith(config.prefix)) return;

    if (["dl", "download", "yt", "tt", "ig"].includes(commandName)) {
      await message.suppressEmbeds(true).catch(() => {});
      await message.react("⏳").catch(() => {});
      return await downloaderHandler(message);
    }

    if (commandName === "ping") {
      const pingCmd = client.commands.get("ping");
      if (pingCmd) return await pingCmd.execute(message, client);
    }

    if (commandName === "help") return await helpHandler(message);
    if (commandName === "diagnostics") return await diagnosticsHandler(message);
    if (commandName === "cookies") return await cookiesHandler(message);

    if (["info", "icon", "banner", "server", "setup"].includes(commandName)) {
      const target = message.mentions.users.first() || message.author;
      const subcommand = args[0] || "info";

      const mockInteraction = {
        guild: message.guild,
        user: message.author,
        member: message.member,
        client: message.client,
        commandName: commandName,
        options: {
          getUser: () => target,
          getSubcommand: () => subcommand,
        },
        reply: async (payload) => {
          const { withResponse, ...cleanPayload } = payload;
          return await message.reply(cleanPayload);
        },
        deferReply: async () => {},
        editReply: async (payload) => {
          return await message.reply(payload);
        },
      };
      if (commandName === "setup") return await setupHandler(mockInteraction);
      return await infoHandler(mockInteraction);
    }
  },
};
