import express from "express";
import Hospital from "../../models/Hospital.js";
import { sanitize } from "../../utils/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hospitofind.online";

router.get("/sitemap-countries.xml", async (req, res) => {
  try {
    const states = await Hospital.distinct("address.state");

    const xmlItems = states
      .filter((state) => state && typeof state === "string")
      .map((state) => {
        const stateSlug = sanitize(state);
        const lastmod = new Date().toISOString().split("T")[0];

        return `
        <url>
          <loc>${FRONTEND_URL}/country/${stateSlug}</loc>
          <lastmod>${lastmod}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>0.8</priority>
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
    console.error("Sitemap Countries Error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
