import express from "express";
const router = express.Router();

router.get("/sitemap.xml", (req, res) => {
  const base = "https://hospitofind.online";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-images.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-countries.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-country-:country.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-city-:country-:city.xml</loc></sitemap>
</sitemapindex>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
