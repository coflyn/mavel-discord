const fs = require("fs");
const path = require("path");

const statsPath = path.join(__dirname, "../database/stats.json");

const dbDir = path.dirname(statsPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

if (!fs.existsSync(statsPath)) {
  fs.writeFileSync(
    statsPath,
    JSON.stringify({ mediaServed: 0, totalRequests: 0 }, null, 2),
  );
}

function getStats() {
  try {
    return JSON.parse(fs.readFileSync(statsPath, "utf-8"));
  } catch (e) {
    return { mediaServed: 0, totalRequests: 0 };
  }
}

function increment(key) {
  const stats = getStats();
  if (stats[key] !== undefined) {
    stats[key]++;
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  }
}

module.exports = { getStats, increment };
