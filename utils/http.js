const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const userAgents = require("./user-agents");

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const DEFAULT_TIMEOUT = 20000;
const MAX_RETRIES = 2;
const DEFAULT_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const http = {
  async _jitter() {
    const delay = Math.floor(Math.random() * 401) + 100;
    return new Promise((r) => setTimeout(r, delay));
  },

  _getStealthHeaders(url) {
    try {
      const parsed = new URL(url);
      const base = `${parsed.protocol}//${parsed.host}`;
      return {
        Origin: base,
        Referer: base + "/",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
      };
    } catch (e) {
      return {};
    }
  },

  async _execute(method, url, data, options = {}) {
    if (!options.noJitter) await this._jitter();

    const maxRetries =
      options.retries !== undefined ? options.retries : MAX_RETRIES;
    const uaType = options.uaType || "desktop";
    let lastError;

    const stealthHeaders = options.disableStealth
      ? {}
      : this._getStealthHeaders(url);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const identity = userAgents.getIdentity(uaType);

        const headers = {
          "User-Agent": identity.ua,
          ...identity.hints,
          ...stealthHeaders,
          ...DEFAULT_HEADERS,
          ...options.headers,
        };

        const config = {
          method,
          url,
          data,
          timeout: options.timeout || DEFAULT_TIMEOUT,
          ...options,
          headers,
          jar,
          withCredentials: true,
        };

        return await client(config);
      } catch (error) {
        lastError = error;
        const status = error.response?.status;

        const shouldRetry =
          !status ||
          [403, 429, 500, 502, 503, 504].includes(status) ||
          error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT";

        if (attempt < maxRetries && shouldRetry) {
          const reason = status
            ? `Status ${status}`
            : error.code || "Network Error";
          console.warn(
            `[HTTP-RETRY] Attempt ${attempt + 1} failed for ${url}. Reason: ${reason}. Changing profile...`,
          );

          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  },

  async get(url, options = {}) {
    return this._execute("get", url, null, options);
  },

  async post(url, data, options = {}) {
    return this._execute("post", url, data, options);
  },

  async request(config) {
    const { url, method, data, ...options } = config;
    return this._execute(method || "get", url, data, options);
  },

  getUserAgent(type = "desktop") {
    return userAgents.get(type);
  },
};

module.exports = http;
