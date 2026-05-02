const http = require("../http");
const cheerio = require("cheerio");

async function scrapeGitHub(username) {
  try {
    const { data } = await http.get(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      {
        headers: { "User-Agent": "MaveL-Bot/1.0" },
        timeout: 10000,
      },
    );

    const reposRes = await http
      .get(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=5`,
        {
          headers: { "User-Agent": "MaveL-Bot/1.0" },
          timeout: 10000,
        },
      )
      .catch(() => ({ data: [] }));

    const topRepos = reposRes.data.map((r) => ({
      name: r.name,
      stars: r.stargazers_count,
      language: r.language || "N/A",
      url: r.html_url,
    }));

    return {
      success: true,
      username: data.login,
      name: data.name || data.login,
      bio: data.bio || "",
      avatar: data.avatar_url,
      repos: data.public_repos,
      followers: data.followers,
      following: data.following,
      created: data.created_at?.split("T")[0] || "Unknown",
      url: data.html_url,
      topRepos,
    };
  } catch (e) {
    if (e.response?.status === 404) {
      return { success: false, error: "User not found" };
    }
    return { success: false, error: e.message };
  }
}

module.exports = {
  scrapeGitHub,
};
