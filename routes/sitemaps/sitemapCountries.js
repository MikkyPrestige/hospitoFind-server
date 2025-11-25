import express from "express";
import Hospital from "../../models/hospitalsModel.js";
import { sanitize } from "../../config/sanitize.js";

const router = express.Router();

router.get("/sitemap-countries.xml", async (req, res) => {
  const base = "https://hospitofind.online";

  const countries = await Hospital.distinct("address.state");

  const xmlItems = countries
    .map((countryRaw) => {
      const country = sanitize(countryRaw);
      return `
<sitemap>
  <loc>${base}/sitemap-country-${country}.xml</loc>
</sitemap>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</sitemapindex>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
