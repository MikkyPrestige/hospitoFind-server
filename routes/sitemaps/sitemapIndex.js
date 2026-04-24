import express from "express";

const router = express.Router();

const SITEMAPS = [
  { path: "/sitemap-static.xml" },
  { path: "/sitemap-countries.xml" },
  { path: "/sitemap-cities.xml" },
  { path: "/sitemap-hospitals.xml" },
  { path: "/sitemap-images.xml" },
];

router.get("/sitemap.xml", (req, res) => {
  const HOST = process.env.FRONTEND_URL || "https://hospitofind.online";

  const items = SITEMAPS.map((sitemap) => {
    return `
      <sitemap>
        <loc>${HOST}${sitemap.path}</loc>
        <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
      </sitemap>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${items}
</sitemapindex>`;

  res.header("Content-Type", "application/xml");
  res.send(xml.trim());
});

export default router;
