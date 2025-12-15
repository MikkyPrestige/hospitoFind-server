import fetch from "node-fetch";

/* =====================================================
   🧠  SHARED HELPERS & CACHE
===================================================== */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
global.cachedNewsData = global.cachedNewsData || {
  results: [],
  lastFetched: 0,
};

let cachedTips = null;
let lastFetchedDate = null;

const stripHtml = (html = "") => html.replace(/<[^>]+>/g, "").trim();

const dedupeByTitle = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    const key = x.title?.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* =====================================================
   🌍  GLOBAL HEALTH NEWS
===================================================== */
async function getCachedNewsData() {
  const now = Date.now();
  if (
    global.cachedNewsData.results.length &&
    now - global.cachedNewsData.lastFetched < CACHE_TTL_MS
  ) {
    console.log(
      "🗂️ Using cached NewsData results:",
      global.cachedNewsData.results.length
    );
    return global.cachedNewsData.results;
  }

  const API_KEY = process.env.NEWSDATA_API_KEY;
  const queryKeywords = encodeURIComponent(
    "outbreak OR virus OR disease OR infection OR epidemic OR fever OR cholera OR ebola OR flu OR covid"
  );

  const url = `https://newsdata.io/api/1/news?category=health&language=en&q=${queryKeywords}&apikey=${API_KEY}`;

  try {
    console.log("🌐 Fetching fresh NewsData...");
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "error" || !Array.isArray(data.results)) {
      console.warn("⚠️ NewsData error:", data.message);
      return [];
    }

    global.cachedNewsData = { results: data.results, lastFetched: now };
    console.log("📰 Cached fresh NewsData results:", data.results.length);
    return data.results;
  } catch (err) {
    console.error("❌ NewsData fetch failed:", err);
    return [];
  }
}

const getGlobalHealthNews = async (req, res) => {
  const news = await getCachedNewsData();
  const articles = news.slice(0, 9).map((n) => ({
    title: n.title || "Untitled",
    date: n.pubDate || "",
    description: n.description || "",
    link: n.link || "",
    image_url: n.image_url || "",
    source: n.source_id || "NewsData",
  }));

  res.json(dedupeByTitle(articles));
  if (!news.length) {
    console.warn("⚠️ No NewsData results — sending fallback articles");
    return res.json([
      {
        title: "Stay informed about your health",
        description: "Check back soon for the latest global health updates.",
        link: "https://newsdata.io",
        image_url: "",
        source: "HospitoFind",
      },
    ]);
  }
};

/* =====================================================
   🚨  HEALTH ALERTS (WHO + NewsData)
===================================================== */
const getHealthAlerts = async (req, res) => {
  const WHO_URL = "https://www.who.int/api/news/diseaseoutbreaknews";
  const BASE_LINK =
    "https://www.who.int/emergencies/disease-outbreak-news/item";

  let alerts = [];
  let whoCount = 0;
  let newsCount = 0;

  // 1️⃣ WHO Alerts
  try {
    const resp = await fetch(WHO_URL);
    const data = await resp.json();
    const whoAlertsRaw = data.value || [];
    const now = Date.now();

    const whoAlerts = whoAlertsRaw
      .map((item) => {
        const dateStr = item.PublicationDate || item.PublicationDateAndTime;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        const daysOld = (now - date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld > 180) return null;

        return {
          title: item.Title || "Unknown outbreak",
          date: dateStr,
          summary: item.Overview
            ? stripHtml(item.Overview).slice(0, 350)
            : "No summary available.",
          link: item.ItemDefaultUrl
            ? `${BASE_LINK}${item.ItemDefaultUrl}`
            : BASE_LINK,
          source: "WHO",
        };
      })
      .filter(Boolean);

    if (whoAlerts.length === 0 && whoAlertsRaw.length > 0) {
      const fallback = whoAlertsRaw.slice(0, 6).map((item) => ({
        title: item.Title || "Unknown outbreak",
        date: item.PublicationDate || item.PublicationDateAndTime || "",
        summary: item.Overview
          ? stripHtml(item.Overview).slice(0, 350)
          : "No summary available.",
        link: item.ItemDefaultUrl
          ? `${BASE_LINK}${item.ItemDefaultUrl}`
          : BASE_LINK,
        source: "WHO (archived)",
      }));
      alerts = alerts.concat(fallback);
      whoCount = fallback.length;
    } else {
      alerts = alerts.concat(whoAlerts);
      whoCount = whoAlerts.length;
    }
  } catch (e) {
    console.warn("WHO fetch failed:", e);
  }

  // 2️⃣ NewsData Alerts
  const news = await getCachedNewsData();
  const outbreakKeywords = [
    "outbreak",
    "epidemic",
    "pandemic",
    "virus",
    "infection",
    "infectious",
    "disease",
    "fever",
    "health alert",
    "covid",
    "flu",
    "malaria",
    "cholera",
    "ebola",
    "dengue",
    "typhoid",
    "zika",
    "yellow fever",
    "plague",
    "measles",
    "mpox",
    "health emergency",
  ];

  const outbreakNews = news.filter((n) => {
    const text = `${n.title || ""} ${n.description || ""}`.toLowerCase();
    return outbreakKeywords.some((kw) => text.includes(kw));
  });

  const mappedOutbreakNews = outbreakNews.map((n) => ({
    title: n.title || "Health update",
    date: n.pubDate || "",
    summary: (n.description || "").slice(0, 350),
    link: n.link || "",
    source: n.source_id ? `NewsData (${n.source_id})` : "NewsData",
  }));

  alerts = alerts.concat(mappedOutbreakNews);
  newsCount = mappedOutbreakNews.length;

  // 3️⃣ Cleanup + Sort
  const unique = dedupeByTitle(alerts).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const top = unique.slice(0, 9);

  console.log(
    `✅ Health Alerts: ${whoCount} WHO + ${newsCount} NewsData = ${top.length}`
  );
  res.json(top);
};

/* =====================================================
   💡  HEALTH TIPS (MyHealthFinder API)
===================================================== */
const getHealthTips = async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  if (cachedTips && lastFetchedDate === today) {
    return res.json(cachedTips);
  }

  try {
    const response = await fetch(
      "https://health.gov/myhealthfinder/api/v4/topicsearch.json?lang=en"
    );
    const data = await response.json();

    let resources = [];
    if (Array.isArray(data?.Result?.Resources?.Resource)) {
      resources = data.Result.Resources.Resource;
    } else if (data?.Result?.Resources?.Resource) {
      resources = [data.Result.Resources.Resource];
    }

    if (!resources.length) {
      console.warn("⚠️ No resources found in MyHealthfinder response");
      return res.status(404).json({ error: "No tips available" });
    }

    // 🎲 Randomly select 3
    const shuffled = resources.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    const formattedTips = selected.map((tip) => ({
      Title: tip.Title || "Stay Healthy Today!",
      ImageUrl: tip.ImageUrl || null,
      ImageAlt: tip.ImageAlt || null,
      Link:
        tip.AccessibleVersion ||
        "https://health.gov/myhealthfinder/topics/everyday-healthy-living",
    }));

    cachedTips = formattedTips;
    lastFetchedDate = today;

    res.json(formattedTips);
  } catch (error) {
    console.error("❌ Error fetching health tips:", error);
    res.status(500).json({
      Title: "Stay Hydrated 💧",
      Description: "Drink at least 8 cups of water daily to stay healthy.",
      ImageUrl: null,
      ImageAlt: null,
      Link: "https://health.gov/myhealthfinder",
    });
  }
};

// const getHealthTips = async (req, res) => {
//   const today = new Date().toISOString().split("T")[0];

//   // Disable caching in development
//   const isDev = process.env.NODE_ENV === "development";

//   if (!isDev && cachedTips && lastFetchedDate === today) {
//     return res.json(cachedTips);
//   }

//   try {
//     const response = await fetch(
//       "https://health.gov/myhealthfinder/api/v4/topicsearch.json?lang=en",
//       { cache: "no-store" }
//     );
//     const data = await response.json();

//     let resources = [];
//     if (Array.isArray(data?.Result?.Resources?.Resource)) {
//       resources = data.Result.Resources.Resource;
//     } else if (data?.Result?.Resources?.Resource) {
//       resources = [data.Result.Resources.Resource];
//     }

//     if (!resources.length) {
//       return res.status(404).json({ error: "No tips available" });
//     }

//     const shuffled = resources.sort(() => 0.5 - Math.random());
//     const selected = shuffled.slice(0, 3);

//     const formattedTips = selected.map((tip) => ({
//       Title: tip.Title || "Stay Healthy Today!",
//       MyHFDescription: tip.MyHFDescription,
//       ImageUrl: tip.ImageUrl || null,
//       ImageAlt: tip.ImageAlt || null,
//       Link:
//         tip.AccessibleVersion ||
//         "https://health.gov/myhealthfinder/topics/everyday-healthy-living",
//     }));

//     if (!isDev) {
//       cachedTips = formattedTips;
//       lastFetchedDate = today;
//     }

//     res.json(formattedTips);
//   } catch (error) {
//     console.error("❌ Error fetching health tips:", error);
//     res.status(500).json({ error: "Failed to fetch health tips" });
//   }
// };

export default { getGlobalHealthNews, getHealthAlerts, getHealthTips };
