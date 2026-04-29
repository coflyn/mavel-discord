const dns = require("dns");
const https = require("https");

const BLOCKED_DOMAINS = [
  "nhentai.net",
  "i.nhentai.net",
  "i2.nhentai.net",
  "i3.nhentai.net",
  "i5.nhentai.net",
  "i7.nhentai.net",
  "t.nhentai.net",
  "t2.nhentai.net",
  "t3.nhentai.net",
  "t5.nhentai.net",
  "t7.nhentai.net",
  "doujindesu.tv",
  "pornhub.com",
  "www.pornhub.com",
  "de.pornhub.com",
  "jp.pornhub.com",
  "ci.phncdn.com",
  "ei.phncdn.com",
  "di.phncdn.com",
  "xnxx.com",
  "www.xnxx.com",
  "xvideos.com",
  "www.xvideos.com",
  "eporner.com",
  "www.eporner.com",
  "pixiv.net",
  "www.pixiv.net",
  "i.pximg.net",
];

const dnsCache = new Map();
const DNS_CACHE_TTL = 5 * 60 * 1000;

function isBlockedDomain(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return BLOCKED_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

function dohResolve(hostname) {
  return new Promise((resolve, reject) => {
    const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;

    const req = https.get(
      url,
      {
        headers: { Accept: "application/dns-json" },
        timeout: 8000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const aRecords = (json.Answer || []).filter((a) => a.type === 1);
            if (aRecords.length > 0) {
              resolve(aRecords[0].data);
            } else {
              reject(new Error(`[DoH] No A records for ${hostname}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("[DoH] Request timeout"));
    });
  });
}

async function resolveWithCache(hostname) {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.time < DNS_CACHE_TTL) {
    return cached.address;
  }

  const address = await dohResolve(hostname);
  dnsCache.set(hostname, { address, time: Date.now() });
  return address;
}

const _originalLookup = dns.lookup.bind(dns);

function patchedLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (isBlockedDomain(hostname)) {
    resolveWithCache(hostname)
      .then((ip) => {
        if (!ip) {
          throw new Error("Resolved IP is empty");
        }
        console.log(`[DOH-BYPASS] ${hostname} → ${ip}`);

        if (options.all) {
          return callback(null, [{ address: ip, family: 4 }]);
        }

        callback(null, ip, 4);
      })
      .catch((err) => {
        console.warn(
          `[DOH-BYPASS] Failed for ${hostname} (${err.message}), falling back to system DNS.`,
        );
        _originalLookup(hostname, options, callback);
      });
  } else {
    _originalLookup(hostname, options, callback);
  }
}

function initBypass() {
  if (process.env.DISABLE_DOH_BYPASS === "true") {
    console.log("[DNS-BYPASS] Disabled via DISABLE_DOH_BYPASS env var.");
    return;
  }

  dns.lookup = patchedLookup;

  console.log(
    "[DNS-BYPASS] Internet Positif bypass initialized (DoH via Cloudflare 1.1.1.1)",
  );
}

async function getChromiumResolverRules(url) {
  try {
    const hostname = new URL(url).hostname;
    if (!isBlockedDomain(hostname)) return [];

    const ip = await resolveWithCache(hostname);
    if (!ip) return [];
    return [`--host-resolver-rules=MAP ${hostname} ${ip}`];
  } catch {
    return [];
  }
}

module.exports = {
  initBypass,
  isBlockedDomain,
  dohResolve,
  resolveWithCache,
  getChromiumResolverRules,
  BLOCKED_DOMAINS,
};
