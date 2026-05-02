const sharp = require("sharp");
const http = require("./http");

let bgCache = {
  url: null,
  buffer: null
};

async function getBackground(bannerUrl) {
  const finalUrl = bannerUrl || "https://i.imgur.com/k4O0MId.png";
  if (bgCache.url === finalUrl && bgCache.buffer) return bgCache.buffer;

  try {
    const res = await http.get(finalUrl, { responseType: "arraybuffer", timeout: 8000 });
    bgCache.url = finalUrl;
    bgCache.buffer = res.data;
    return res.data;
  } catch (e) {
    return null;
  }
}

async function generateCard(bannerUrl, avatarUrl, username, type = "welcome") {
  try {
    const backgroundData = await getBackground(bannerUrl);
    if (!backgroundData) return null;

    let avatarBuffer = null;
    const avatarSize = 250;
    try {
      const avatarRes = await http.get(avatarUrl, { responseType: "arraybuffer", timeout: 5000 });
      avatarBuffer = await sharp(avatarRes.data)
        .resize(avatarSize, avatarSize)
        .composite([{
          input: Buffer.from(`<svg><circle cx="${avatarSize/2}" cy="${avatarSize/2}" r="${avatarSize/2}" /></svg>`),
          blend: "dest-in"
        }])
        .toBuffer();
    } catch (e) {}

    const width = 1200;
    const height = 500;
    const isWelcome = type === "welcome";
    const accentColor = isWelcome ? "#a29bfe" : "#ff7675";

    const svgText = `
    <svg width="${width}" height="${height}">
      <style>
        .title { fill: #ffffff; font-size: 85px; font-weight: 900; font-family: 'Avenir Next', 'Futura', sans-serif; text-transform: uppercase; letter-spacing: 12px; }
        .name { fill: ${accentColor}; font-size: 60px; font-weight: 800; font-family: 'Avenir Next', 'Futura', sans-serif; text-transform: uppercase; letter-spacing: 3px; }
        .shadow { filter: drop-shadow(0px 8px 15px rgba(0,0,0,0.6)); }
      </style>
      <text x="50%" y="${avatarBuffer ? 385 : 255}" text-anchor="middle" class="title shadow">${type === "welcome" ? "WELCOME" : "GOODBYE"}</text>
      <text x="50%" y="${avatarBuffer ? 460 : 330}" text-anchor="middle" class="name shadow">${username.toUpperCase().substring(0, 18)}</text>
    </svg>`;

    const layers = [{ input: Buffer.from(svgText), top: 0, left: 0 }];
    if (avatarBuffer) {
      layers.unshift({ input: avatarBuffer, top: 70, left: Math.floor((width - avatarSize) / 2) });
    }

    return await sharp(backgroundData)
      .resize(width, height)
      .modulate({ brightness: 0.6 })
      .composite(layers)
      .png()
      .toBuffer();
  } catch (err) {
    return null;
  }
}

module.exports = { 
  generateWelcomeCard: (b, a, u) => generateCard(b, a, u, "welcome"),
  generateGoodbyeCard: (b, a, u) => generateCard(b, a, u, "goodbye")
};
