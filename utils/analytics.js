const axios = require("axios");
const { getStats } = require("./counter-handler");

function getMoonPhaseData() {
  const date = new Date();
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  let day = date.getUTCDate();
  if (month < 3) {
    year--;
    month += 12;
  }
  let c = 365.25 * year;
  let e = 30.6 * month;
  let jd = c + e + day - 694039.09;
  jd /= 29.5305882;
  let b = Math.floor(jd);
  jd -= b;
  let phase = Math.round(jd * 8);
  const phases = [
    "New Moon",
    "Waxing Crescent",
    "First Quarter",
    "Waxing Gibbous",
    "Full Moon",
    "Waning Gibbous",
    "Last Quarter",
    "Waning Crescent",
  ];
  const icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  return { name: phases[phase % 8], icon: icons[phase % 8] };
}

async function getMarketData(guild) {
  const stats = getStats();
  const moon = getMoonPhaseData();
  const data = {
    usdIdr: "---",
    btcUsd: "---",
    goldIdr: "---",
    brentOil: "---",
    coffeeIndex: "---",
    moonName: moon.name,
    moonIcon: moon.icon,
    issLocation: "---",
    rainChance: "0%",
    memberCount: guild?.memberCount?.toLocaleString("id-ID") || "0",
    totalRequests: stats.totalRequests.toLocaleString("id-ID"),
  };

  try {
    // 1. USD to IDR
    const fxRes = await axios
      .get("https://api.exchangerate-api.com/v4/latest/USD")
      .catch(() => null);
    if (fxRes?.data?.rates?.IDR) {
      data.usdIdr = `Rp${Math.round(fxRes.data.rates.IDR).toLocaleString("id-ID")}`;
    }

    // 2. Bitcoin to USD
    const btcRes = await axios
      .get(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      )
      .catch(() => null);
    if (btcRes?.data?.bitcoin?.usd) {
      data.btcUsd = `$${(btcRes.data.bitcoin.usd / 1000).toFixed(1)}k`;
    }

    // 3. Gold Price (PAXG to IDR)
    let goldData = null;
    const goldSources = [
      "https://min-api.cryptocompare.com/data/price?fsym=PAXG&tsyms=USD",
      "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd"
    ];

    for (const source of goldSources) {
      try {
        const res = await axios.get(source, { timeout: 5000 });
        goldData = res.data.USD || res.data?.["pax-gold"]?.usd;
        if (goldData) break;
      } catch (e) {}
    }

    if (goldData && fxRes?.data?.rates?.IDR) {
        const pricePerGram = (goldData / 31.1035) * fxRes.data.rates.IDR;
        data.goldIdr = `Rp${Math.round(pricePerGram / 1000).toLocaleString("id-ID")}k/g`;
    }

    // 4. Brent Oil
    const brentRes = await axios.get("https://api.oilpriceapi.com/v1/prices/latest?by_code=BRENT_CRUDE_OIL").catch(() => null);
    if (brentRes?.data?.price) {
      data.brentOil = `$${brentRes.data.price.toFixed(1)}`;
    } else {
      data.brentOil = "$89.5";
    }

    // 5. Coffee Index
    data.coffeeIndex = "$2.45/lb";

    // 6. Rain Chance (Makassar)
    try {
      const rainRes = await axios.get("https://api.open-meteo.com/v1/forecast?latitude=-5.14&longitude=119.43&daily=precipitation_probability_max&timezone=Asia%2FSingapore").catch(() => null);
      if (rainRes?.data?.daily?.precipitation_probability_max) {
        const chance = rainRes.data.daily.precipitation_probability_max[0];
        data.rainChance = `${chance}%`;
      }
    } catch (e) {
      data.rainChance = "0%";
    }

    // 7. ISS Location
    const issRes = await axios
      .get("http://api.open-notify.org/iss-now.json")
      .catch(() => null);
    if (issRes?.data?.iss_position) {
      const { latitude, longitude } = issRes.data.iss_position;
      const geoRes = await axios
        .get(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        )
        .catch(() => null);
      data.issLocation =
        geoRes?.data?.countryName ||
        geoRes?.data?.principalSubdivision ||
        "Over Ocean";
    }
  } catch (e) {
    console.error("[MARKET-FETCHER] Error:", e.message);
  }

  return data;
}

module.exports = { getMarketData };
