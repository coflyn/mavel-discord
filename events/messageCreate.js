const { MessageFlags, ChannelType } = require("discord.js");
const config = require("../config");
const downloaderHandler = require("../handlers/downloader");
const helpHandler = require("../handlers/tools/help");
const diagnosticsHandler = require("../handlers/tools/diagnostics");
const cookiesHandler = require("../handlers/tools/cookies");
const setupHandler = require("../handlers/tools/setup");

const cooldowns = new Map();
const COOLDOWN_TIME = 60000;
const MAX_COMMANDS_PER_WINDOW = 2;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cooldowns.entries()) {
    if (now - value.start > COOLDOWN_TIME) cooldowns.delete(key);
  }
}, 600000);

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot) return;

    const now = Date.now();
    const globalKey = `${message.author.id}_global`;
    const globalData = cooldowns.get(globalKey) || { count: 0, start: now };

    if (now - globalData.start > COOLDOWN_TIME) {
      globalData.count = 0;
      globalData.start = now;
    }

    try {
      const fs = require("fs");
      const settingsFile = require("path").join(
        __dirname,
        "../database/settings.json",
      );
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
        if (settings.isHibernating) return;
      }
    } catch (e) {}
    const args = message.content.startsWith(config.prefix)
      ? message.content.slice(config.prefix.length).trim().split(/ +/)
      : [];
    const commandName = args.length > 0 ? args.shift().toLowerCase() : "";

    const isTicketRoom =
      message.channel.name &&
      (message.channel.name.startsWith("🔒") ||
        message.channel.name.startsWith("📁"));
    const isAllowed =
      !config.allowedChannelId ||
      message.channel.id === config.allowedChannelId ||
      isTicketRoom;
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
        if (!(await checkRateLimit())) return;
        return await helpHandler(message);
      }
    }

    if (!isAllowed && !isMusicChannel && !isLogsChannel && !isAdminChannel)
      return;

    const checkRateLimit = async () => {
      if (globalData.count >= MAX_COMMANDS_PER_WINDOW) {
        const waitTime = Math.ceil(
          (COOLDOWN_TIME - (now - globalData.start)) / 1000,
        );
        const redEmoji =
          message.guild?.emojis.cache.find((e) => e.name === "ping_red") ||
          "🔴";

        await message
          .reply(
            `### ${redEmoji} **Rate Limit Reached**\n*MaveL only allows **${MAX_COMMANDS_PER_WINDOW} commands per minute** to maintain stability. Try again in **${waitTime}s**.*`,
          )
          .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 10000))
          .catch(() => {});
        return false;
      }
      globalData.count++;
      cooldowns.set(globalKey, globalData);
      return true;
    };

    if (message.content.match(/https?:\/\/[^\s]+/)) {
      try {
        if (!(await checkRateLimit())) return;

        const leaEmoji = message.guild?.emojis.cache.find(
          (e) => e.name === "lea",
        );
        await message.suppressEmbeds(true).catch(() => {});
        await message.react(leaEmoji || "⏳").catch(() => {});
        return await downloaderHandler(message);
      } catch (e) {
        console.error("[LINK-HANDLER] Error:", e.message);
      }
    }

    if (!message.content.startsWith(config.prefix)) return;

    if (["dl", "download", "yt", "tt", "ig"].includes(commandName)) {
      if (!(await checkRateLimit())) return;
      await message.suppressEmbeds(true).catch(() => {});
      await message.react("⏳").catch(() => {});
      return await downloaderHandler(message);
    }

    if (commandName === "ping") {
      if (!(await checkRateLimit())) return;
      const pingCmd = client.commands.get("ping");
      if (pingCmd) return await pingCmd.execute(message, client);
    }

    if (commandName === "help") {
      if (!(await checkRateLimit())) return;
      return await helpHandler(message);
    }
    if (commandName === "diagnostics") {
      if (!(await checkRateLimit())) return;
      return await diagnosticsHandler(message);
    }
    if (commandName === "cookies") {
      if (!(await checkRateLimit())) return;
      return await cookiesHandler(message);
    }

    if (commandName === "setup") {
      if (!(await checkRateLimit())) return;
      const mockInteraction = {
        guild: message.guild,
        user: message.author,
        member: message.member,
        client: message.client,
        commandName: commandName,
        options: {
          getUser: () => message.mentions.users.first() || message.author,
          getSubcommand: () => args[0] || "info",
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
      return await setupHandler(mockInteraction);
    }
  },
};
