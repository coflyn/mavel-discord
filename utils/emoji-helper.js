const { REQUIRED_EMOJIS } = require("./emoji-registry");

function resolveEmoji(target, name, fallback) {
  const guild = target?.guild || target;
  if (guild && guild.emojis && guild.emojis.cache) {
    const emoji = guild.emojis.cache.find((e) => e.name === name);
    if (emoji) return emoji.toString();
  }

  const client = target?.client || (target?.guild ? target.guild.client : null);
  if (client && client.emojis && client.emojis.cache) {
    const emoji = client.emojis.cache.find((e) => e.name === name);
    if (emoji) return emoji.toString();
  }

  const registry = REQUIRED_EMOJIS.find((e) => e.name === name);
  if (registry) return `<:${registry.name}:${registry.id}>`;

  return fallback;
}

module.exports = {
  resolveEmoji,
};
