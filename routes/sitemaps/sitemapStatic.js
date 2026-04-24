import express from "express";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hospitofind.online";

const staticPages = [
  { url: "/", priority: "1.0" },
  { url: "/find-hospital", priority: "0.9" },
  { url: "/about", priority: "0.8" },
  { url: "/directory", priority: "0.85" },
  { url: "/health-news", priority: "0.8" },
  { url: "/disease-outbreaks", priority: "0.8" },
  { url: "/health-tips", priority: "0.8" },
  { url: "/faq", priority: "0.7" },
  { url: "/policy", priority: "0.6" },
  { url: "/terms", priority: "0.6" },
];

router.get("/sitemap-static.xml", (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const xmlItems = staticPages
      .map((page) => {
        return `
        <url>
          <loc>${FRONTEND_URL}${page.url}</loc>
          <lastmod>${today}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>${page.priority}</priority>
        </url>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${xmlItems}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml.trim());
  } catch (error) {
    console.error("Sitemap Static Error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
