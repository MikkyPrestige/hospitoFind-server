import express from "express";
import Hospital from "../../models/Hospital.js";
import { sanitize } from "../../utils/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hospitofind.online";

router.get("/sitemap-cities.xml", async (req, res) => {
  try {
    const locations = await Hospital.aggregate([
      {
        $match: {
          "address.state": { $exists: true, $ne: null },
          "address.city": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: {
            state: "$address.state",
            city: "$address.city",
          },
        },
      },
    ]);

    const xmlItems = locations
      .map((loc) => {
        const stateSlug = sanitize(loc._id.state);
        const citySlug = sanitize(loc._id.city);
        const lastmod = new Date().toISOString().split("T")[0];

        return `
        <url>
          <loc>${FRONTEND_URL}/country/${stateSlug}/${citySlug}</loc>
          <lastmod>${lastmod}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>0.75</priority>
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
    console.error("Sitemap Cities Error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
