import express from "express";
import Hospital from "../../models/Hospital.js";
import { sanitize } from "../../utils/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hospitofind.online";

router.get("/sitemap-hospitals.xml", async (req, res) => {
  try {
    const hospitals = await Hospital.find(
      {},
      "slug updatedAt address.state address.city",
    ).lean();

    const xmlItems = hospitals
      .map((h) => {
        const stateSlug = sanitize(h.address?.state || "");
        const citySlug = sanitize(h.address?.city || "");
        const slug = sanitize(h.slug || "");

        const lastmod = h.updatedAt
          ? h.updatedAt.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        return `
        <url>
          <loc>${FRONTEND_URL}/hospital/${stateSlug}/${citySlug}/${slug}</loc>
          <lastmod>${lastmod}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.9</priority>
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
    console.error("Sitemap Hospitals Error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
