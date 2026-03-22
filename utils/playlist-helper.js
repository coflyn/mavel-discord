const fs = require("fs");
const path = require("path");
const PLAYLISTS_FILE = path.join(__dirname, "../database/playlists.json");

const dbDir = path.dirname(PLAYLISTS_FILE);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

function savePlaylist(userId, name, tracks) {
  let data = {};
  if (fs.existsSync(PLAYLISTS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE));
    } catch (e) {
      data = {};
    }
  }
  if (!data[userId]) data[userId] = {};
  data[userId][name.toLowerCase()] = tracks.map((t) => ({
    url: t.url,
    title: t.title,
  }));
  fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(data, null, 2));
  return true;
}

function getPlaylists(userId) {
  if (!fs.existsSync(PLAYLISTS_FILE)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE));
    return data[userId] || {};
  } catch (e) {
    return {};
  }
}

function deletePlaylist(userId, name) {
  if (!fs.existsSync(PLAYLISTS_FILE)) return false;
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE));
  } catch (e) {
    return false;
  }

  if (data[userId] && data[userId][name.toLowerCase()]) {
    delete data[userId][name.toLowerCase()];
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

module.exports = { savePlaylist, getPlaylists, deletePlaylist };
