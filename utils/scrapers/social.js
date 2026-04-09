const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function formatCount(num) {
  if (num === undefined || num === null) return "---";
  if (typeof num === "string") return num;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 10000) return (num / 1000).toFixed(1) + "K";
  if (num >= 1000) return num.toLocaleString();
  return String(num);
}

function getIGCookies() {
  const cookiesPath = path.join(__dirname, "../../cookies.txt");
  if (!fs.existsSync(cookiesPath)) return "";

  try {
    const lines = fs.readFileSync(cookiesPath, "utf8").split("\n");
    return lines
      .filter((l) => !l.startsWith("#") && l.trim())
      .map((l) => l.split("\t"))
      .filter(
        (p) =>
          p.length >= 7 &&
          (p[0].includes("instagram.com") || p[0].includes(".instagram.com")),
      )
      .map((p) => `${p[5]}=${p[6]}`)
      .join("; ");
  } catch (e) {
    console.error("[IG COOKIES LOG]", e.message);
    return "";
  }
}

async function scrapeInstagram(username) {
  try {
    const cleanUser = username.replace("@", "");
    const url = `https://www.instagram.com/${cleanUser}/`;
    const cookieHeader = getIGCookies();

    const headers = {
      ...COMMON_HEADERS,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const res = await axios.get(url, { headers, timeout: 10000 });
    const html = res.data;
    const $ = cheerio.load(html);

    const title = $("title").text();
    const description =
      $('meta[property="og:description"]').attr("content") || "";
    const profilePic = $('meta[property="og:image"]').attr("content") || "";

    let followers = "---",
      following = "---",
      posts = "---";

    const cleanDesc = description.replace(/&#\d+;/g, (match) =>
      String.fromCharCode(match.match(/\d+/)[0]),
    );

    const statsMatch = cleanDesc.match(
      /([\d,.]+[KkMm]?)\s*Followers?,\s*([\d,.]+[KkMm]?)\s*Following,\s*([\d,.]+[KkMm]?)\s*Posts?(?:.*)/i,
    );

    if (statsMatch) {
      followers = statsMatch[1];
      following = statsMatch[2];
      posts = statsMatch[3];
    }

    const scripts = $("script").toArray();
    let bio = "",
      isVerified = false,
      isPrivate = false,
      hdProfilePic = "";
    for (const script of scripts) {
      const content = $(script).html() || "";

      if (!bio) {
        const bioMatch = content.match(/"biography":"(.*?)(?<!\\)"/);
        if (bioMatch) {
          bio = bioMatch[1]
            .replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) =>
              String.fromCharCode(parseInt(grp, 16)),
            )
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"');
        }
      }

      if (!hdProfilePic) {
        const hdMatch = content.match(/"profile_pic_url_hd":"(.*?)(?<!\\)"/);
        if (hdMatch) {
          hdProfilePic = hdMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (m, g) =>
            String.fromCharCode(parseInt(g, 16)),
          );
        }
      }

      if (content.includes('"is_verified":true')) isVerified = true;
      if (content.includes('"is_private":true')) isPrivate = true;
    }

    return {
      success: true,
      username: cleanUser,
      title: title.split("•")[0]?.split("(@")[0]?.trim() || title,
      profilePic: hdProfilePic || profilePic,
      followers,
      following,
      posts,
      bio: bio || "",
      isVerified,
      isPrivate,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function scrapeTikTok(username) {
  const cleanUser = username.replace("@", "");
  try {
    const ts = Math.floor(Date.now() / 1000);
    const salt = "N1o4YT1Eg8mJZCZVu4oB0uSqSnLFKEz7";
    const token = crypto
      .createHash("sha256")
      .update(cleanUser + ts + salt)
      .digest("hex");

    const res = await axios.post(
      "https://soft-tree-dc7e.9f45zxhnvv.workers.dev/",
      { username: cleanUser, ts: ts },
      {
        headers: {
          ...COMMON_HEADERS,
          "X-App-Ts": ts.toString(),
          "X-App-Token": token,
          Origin: "https://omar-thing.site",
          Referer: "https://omar-thing.site/",
        },
        timeout: 10000,
      },
    );

    const user = res.data;
    if (user && user.username) {
      return {
        success: true,
        username: user.username,
        nickname: user.nickname,
        bio: user.about,
        profilePic: user.avatar,
        followers: formatCount(user.stats?.followers),
        following: formatCount(user.stats?.following),
        likes: formatCount(user.stats?.hearts),
        videos: formatCount(user.stats?.videos),
        isVerified: user.isVerified === "Yes",
        region: user.region || "Unknown",
      };
    }
  } catch (e) {
    console.warn("[TikTok API Error]", e.message);
  }

  try {
    const url = `https://www.tiktok.com/@${cleanUser}`;
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      timeout: 8000,
    });

    const $ = cheerio.load(res.data);
    const nickname =
      $('h1[data-e2e="user-title"]').text() ||
      $('h2[data-e2e="user-subtitle"]').text();
    const bio = $('h2[data-e2e="user-bio"]').text() || "";
    const followers = $('strong[data-e2e="followers-count"]').text() || "---";
    const following = $('strong[data-e2e="following-count"]').text() || "---";
    const likes = $('strong[data-e2e="likes-count"]').text() || "---";
    const profilePic = $('meta[property="og:image"]').attr("content") || "";

    if (nickname || bio) {
      return {
        success: true,
        username: cleanUser,
        nickname: nickname.trim(),
        bio: bio.trim(),
        profilePic,
        followers,
        following,
        likes,
        videos: "---",
        isVerified: res.data.includes("verified-icon"),
        region: "Unknown",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: "TikTok currently restricted or API down.",
    };
  }

  return {
    success: false,
    error: "Tiktok User not found.",
  };
}

async function scrapeYouTube(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(res.data);
    const title =
      $('meta[property="og:title"]').attr("content") || $("title").text();
    const description =
      $('meta[property="og:description"]').attr("content") || "";
    const thumbnail = $('meta[property="og:image"]').attr("content") || "";
    const channelName = $('link[itemprop="name"]').attr("content") || "";

    return {
      success: true,
      title,
      description: description.substring(0, 500),
      thumbnail,
      channel: channelName,
      url,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function scrapeReddit(topic) {
  try {
    const res = await axios.get(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=relevance&t=week&limit=8`,
      {
        headers: {
          ...COMMON_HEADERS,
          "User-Agent": "MaveL-Bot/1.0",
        },
        timeout: 10000,
      },
    );

    const posts = res.data.data.children.map((c) => ({
      title: c.data.title,
      author: c.data.author,
      subreddit: c.data.subreddit_name_prefixed,
      ups: c.data.ups,
      comments: c.data.num_comments,
      link: `https://www.reddit.com${c.data.permalink}`,
      created: new Date(c.data.created_utc * 1000).toISOString(),
    }));

    return { success: true, posts, topic };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function searchSocials(username) {
  const sites = [
    { name: "Instagram", url: `https://www.instagram.com/${username}/` },
    { name: "TikTok", url: `https://www.tiktok.com/@${username}` },
    { name: "Twitter", url: `https://twitter.com/${username}` },
    { name: "GitHub", url: `https://github.com/${username}` },
    { name: "Pinterest", url: `https://www.pinterest.com/${username}/` },
    { name: "Reddit", url: `https://www.reddit.com/user/${username}` },
    { name: "YouTube", url: `https://www.youtube.com/@${username}` },
  ];

  const results = [];
  const promises = sites.map(async (site) => {
    try {
      const res = await axios.get(site.url, {
        headers: COMMON_HEADERS,
        timeout: 5000,
        validateStatus: () => true,
      });

      if (res.status === 200 && !res.data.includes("Page Not Found") && !res.data.includes("doesn’t exist")) {
        results.push({ name: site.name, url: site.url, status: "Found" });
      } else {
        results.push({ name: site.name, url: site.url, status: "Not Found" });
      }
    } catch {
      results.push({ name: site.name, url: site.url, status: "Error/Blocked" });
    }
  });

  await Promise.all(promises);
  return { success: true, username, results };
}

module.exports = {
  scrapeInstagram,
  scrapeTikTok,
  scrapeYouTube,
  scrapeReddit,
  searchSocials,
  getIGCookies,
};
