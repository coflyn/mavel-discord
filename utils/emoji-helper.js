const { REQUIRED_EMOJIS } = require("./emoji-registry");

function resolveEmoji(guild, name, fallback) {
  if (guild && guild.emojis && guild.emojis.cache) {
    const emoji = guild.emojis.cache.find((e) => e.name === name);
    if (emoji) return emoji.toString();
  }

  const registry = REQUIRED_EMOJIS.find((e) => e.name === name);
  if (registry) return `<:${registry.name}:${registry.id}>`;

  return fallback;
}

module.exports = {
  resolveEmoji,
};
