import express from "express";
import Hospital from "../../models/hospitalsModel.js";
import { sanitize } from "../../config/sanitize.js";

const router = express.Router();

router.get("/sitemap-city-:country-:city.xml", async (req, res) => {
  const base = "https://hospitofind.online";
  const countryParam = req.params.country;
  const cityParam = req.params.city;

  const countries = await Hospital.distinct("address.state");
  const realCountry = countries.find((c) => sanitize(c) === countryParam);

  if (!realCountry) return res.status(404).send("Country not found");

  const cities = await Hospital.find(
    { "address.state": realCountry },
    { "address.city": 1 }
  ).distinct("address.city");

  const realCity = cities.find((c) => sanitize(c) === cityParam);

  if (!realCity) return res.status(404).send("City not found");

  const hospitals = await Hospital.find(
    { "address.state": realCountry, "address.city": realCity },
    "_id updatedAt photoUrl"
  ).lean();

  const xmlItems = hospitals
    .map(
      (h) => `
<url>
  <loc>${base}/hospital/${h._id}</loc>
  <lastmod>${new Date(h.updatedAt).toISOString()}</lastmod>
  ${
    h.photoUrl
      ? `
  <image:image>
    <image:loc>${h.photoUrl}</image:loc>
  </image:image>`
      : ""
  }
</url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${xmlItems}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
