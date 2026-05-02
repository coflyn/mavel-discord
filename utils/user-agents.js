const RAW_DATA = {
  desktop: [
    // --- GOOGLE CHROME (Windows/Mac/Linux) ---
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    },
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    },
    {
      ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
      },
    },
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="148", "Chromium";v="148", "Not.A/Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    },

    // --- MICROSOFT EDGE ---
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      hints: {
        "sec-ch-ua":
          '"Microsoft Edge";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    },
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      hints: {
        "sec-ch-ua":
          '"Microsoft Edge";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    },

    // --- BRAVE BROWSER ---
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Brave";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    },

    // --- OPERA ---
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 OPR/112.0.0.0",
      hints: {
        "sec-ch-ua":
          '"Opera";v="112", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    },

    // --- MOZILLA FIREFOX ---
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.1; rv:147.0) Gecko/20100101 Firefox/147.0",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
      hints: {},
    },

    // --- APPLE SAFARI ---
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 16_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.5 Safari/605.1.15",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
      hints: {},
    },
  ],
  mobile: [
    // --- CHROME MOBILE (Android) ---
    {
      ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
    },
    {
      ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="146", "Chromium";v="146", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
    },

    // --- SAFARI MOBILE (iOS) ---
    {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.4 Mobile/15E148 Safari/604.1",
      hints: { "sec-ch-ua-mobile": "?1", "sec-ch-ua-platform": '"iOS"' },
    },
    {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
      hints: { "sec-ch-ua-mobile": "?1", "sec-ch-ua-platform": '"iOS"' },
    },

    // --- CHROME MOBILE (iOS) ---
    {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/147.0.6422.80 Mobile/15E148 Safari/604.1",
      hints: {
        "sec-ch-ua":
          '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"iOS"',
      },
    },
  ],
  bot: [
    {
      ua: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (compatible; TelegramBot/1.0; +https://core.telegram.org/bots/webhooks)",
      hints: {},
    },
    {
      ua: "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
      hints: {},
    },
    { ua: "Mozilla/5.0 (compatible; Twitterbot/1.1)", hints: {} },
    {
      ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      hints: {},
    },
  ],
};

class UAManager {
  constructor() {
    this.pools = {};
    this.indices = {};
    Object.keys(RAW_DATA).forEach((type) => {
      this.pools[type] = this._shuffle([...RAW_DATA[type]]);
      this.indices[type] = 0;
    });
  }

  _shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  getIdentity(type = "desktop") {
    const pool = this.pools[type] || this.pools.desktop;
    const index = this.indices[type] || 0;
    const identity = pool[index];
    this.indices[type] = (index + 1) % pool.length;
    return identity;
  }

  get(type = "desktop") {
    return this.getIdentity(type).ua;
  }
  getDesktop() {
    return this.get("desktop");
  }
  getMobile() {
    return this.get("mobile");
  }
  getRandom() {
    const combined = [...this.pools.desktop, ...this.pools.mobile];
    return combined[Math.floor(Math.random() * combined.length)].ua;
  }
  refresh() {
    Object.keys(RAW_DATA).forEach((type) => {
      this.pools[type] = this._shuffle([...RAW_DATA[type]]);
      this.indices[type] = 0;
    });
  }
  get list() {
    return Object.keys(this.pools).reduce((acc, type) => {
      acc[type] = this.pools[type].map((i) => i.ua);
      return acc;
    }, {});
  }
}

module.exports = new UAManager();
