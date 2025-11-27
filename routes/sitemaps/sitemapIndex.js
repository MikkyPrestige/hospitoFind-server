import express from "express";

const router = express.Router();

// List of sitemap files to include in the sitemap index
const SITEMAPS = [
  "/sitemap-static.xml",
  "/sitemap-countries.xml",
  "/sitemap-cities.xml",
  "/sitemap-hospitals.xml",
  "/sitemap-images.xml",
];

// sitemap index XML file
router.get("/sitemap.xml", (req, res) => {
  const HOST = "https://hospitofind.online";

  const items = SITEMAPS.map((path) => {
    return `
      <sitemap>
        <loc>${HOST}${path}</loc>
      </sitemap>
    `;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${items}
  </sitemapindex>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
