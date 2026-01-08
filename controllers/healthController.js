import fetch from "node-fetch";
import {
  stripHtml,
  dedupeByTitle,
  OUTBREAK_KEYWORDS,
} from "../utils/healthHelpers.js";

/* =====================================================
   CACHE STATE (In-Memory)
===================================================== */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let newsCache = { results: [], lastFetched: 0 };
let tipsCache = { results: [], lastFetchedDate: null };

/* =====================================================
    FETCH NEWS
===================================================== */
async function fetchNewsData() {
  const now = Date.now();

  if (newsCache.results.length && now - newsCache.lastFetched < CACHE_TTL_MS) {
    return newsCache.results;
  }

  const API_KEY = process.env.NEWSDATA_API_KEY;
  const query = encodeURIComponent(
    "health AND (outbreak OR virus OR vaccine OR medicine OR wellness OR disease)"
  );
  const url = `https://newsdata.io/api/1/news?category=health&language=en&q=${query}&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "error" || !Array.isArray(data.results)) {
      return [];
    }

    newsCache = { results: data.results, lastFetched: now };
    return data.results;
  } catch (err) {
    console.error("News fetch error:", err);
    return [];
  }
}

/* =====================================================
    CONTROLLER FUNCTIONS
===================================================== */
// @desc    Get Global Health News
// @route   GET /api/health/news
const getGlobalHealthNews = async (req, res) => {
  try {
    const news = await fetchNewsData();

    if (!news || news.length === 0) {
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

    const articles = news.map((n) => ({
      title: n.title || "Untitled",
      pubDate: n.pubDate || "",
      description: n.description || "",
      link: n.link || "",
      image_url: n.image_url || "",
      source_id: n.source_id || "NewsData",
    }));

    res.json(dedupeByTitle(articles));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// @desc    Get Health Alerts (WHO + NewsData)
// @route   GET /api/health/alerts
const getHealthAlerts = async (req, res) => {
  const WHO_URL = "https://www.who.int/api/news/diseaseoutbreaknews";
  const BASE_LINK =
    "https://www.who.int/emergencies/disease-outbreak-news/item";

  let alerts = [];

  // Fetch WHO Alerts
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
      alerts = alerts.concat(
        whoAlertsRaw.slice(0, 6).map((item) => ({
          title: item.Title || "Unknown outbreak",
          date: item.PublicationDate || "",
          summary: stripHtml(item.Overview || "").slice(0, 350),
          link: item.ItemDefaultUrl
            ? `${BASE_LINK}${item.ItemDefaultUrl}`
            : BASE_LINK,
          source: "WHO (archived)",
        }))
      );
    } else {
      alerts = alerts.concat(whoAlerts);
    }
  } catch (e) {
    console.warn("WHO fetch failed:", e.message);
  }
  //   if (whoAlerts.length === 0 && whoAlertsRaw.length > 0) {
  //     const fallback = whoAlertsRaw.slice(0, 6).map((item) => ({
  //       title: item.Title || "Unknown outbreak",
  //       date: item.PublicationDate || item.PublicationDateAndTime || "",
  //       summary: item.Overview
  //         ? stripHtml(item.Overview).slice(0, 350)
  //         : "No summary available.",
  //       link: item.ItemDefaultUrl
  //         ? `${BASE_LINK}${item.ItemDefaultUrl}`
  //         : BASE_LINK,
  //       source: "WHO (archived)",
  //     }));
  //     alerts = alerts.concat(fallback);
  //     whoCount = fallback.length;
  //   } else {
  //     alerts = alerts.concat(whoAlerts);
  //     whoCount = whoAlerts.length;
  //   }
  // } catch (e) {
  //   console.warn("WHO fetch failed:", e);
  // }

  const news = await fetchNewsData();

  const outbreakNews = news
    .filter((n) => {
      const text = `${n.title || ""} ${n.description || ""}`.toLowerCase();
      return OUTBREAK_KEYWORDS.some((kw) => text.includes(kw));
    })
    .map((n) => ({
      title: n.title || "Health update",
      date: n.pubDate || "",
      summary: (n.description || "").slice(0, 350),
      link: n.link || "",
      source: n.source_id ? `NewsData (${n.source_id})` : "NewsData",
    }));

  alerts = alerts.concat(outbreakNews);

  const unique = dedupeByTitle(alerts).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  res.json(unique.slice(0, 9));
};

// @desc    Get Health Tips (MyHealthFinder)
// @route   GET /api/health/tips
const getHealthTips = async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  // Return Cached Tips if valid
  if (tipsCache.results.length && tipsCache.lastFetchedDate === today) {
    return res.json(tipsCache.results);
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
      return res.status(404).json({ error: "No tips available" });
    }

    // Shuffle & Select
    const shuffled = resources.sort(() => 0.5 - Math.random());
    const formattedTips = shuffled.slice(0, 12).map((tip) => ({
      Title: tip.Title || "Stay Healthy Today",
      ImageUrl: tip.ImageUrl || null,
      ImageAlt: tip.ImageAlt || null,
      Link: tip.AccessibleVersion || "https://health.gov/myhealthfinder",
    }));

    // Update Cache
    tipsCache = { results: formattedTips, lastFetchedDate: today };

    res.json(formattedTips);
  } catch (error) {
    console.error("Error fetching health tips:", error);
    res.status(500).json([]);
  }
};

export default { getGlobalHealthNews, getHealthAlerts, getHealthTips };
