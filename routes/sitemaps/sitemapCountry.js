import express from "express";
import Hospital from "../../models/hospitalsModel.js";
import { sanitize } from "../../config/sanitize.js";

const router = express.Router();

router.get("/sitemap-country-:country.xml", async (req, res) => {
  const base = "https://hospitofind.online";
  const countryParam = req.params.country;

  const allCountries = await Hospital.distinct("address.state");
  const realCountry = allCountries.find((c) => sanitize(c) === countryParam);

  if (!realCountry) return res.status(404).send("Country not found");

  const cities = await Hospital.find(
    { "address.state": realCountry },
    { "address.city": 1 }
  ).distinct("address.city");

  const xmlItems = cities
    .map((cityRaw) => {
      const city = sanitize(cityRaw);
      const country = sanitize(realCountry);

      return `
<sitemap>
  <loc>${base}/sitemap-city-${country}-${city}.xml</loc>
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
