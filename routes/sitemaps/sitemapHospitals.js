import express from "express";
import Hospital from "../../models/Hospital.js";
import { sanitize } from "../../utils/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL;

// sitemap for hospitals based on their addresses and slugs
router.get("/sitemap-hospitals.xml", async (req, res) => {
  const hospitals = await Hospital.find(
    {},
    "slug updatedAt address.state address.city"
  ).lean();

  const xmlItems = hospitals
    .map((h) => {
      const stateSlug = sanitize(h.address.state);
      const citySlug = sanitize(h.address.city);
      const slug = sanitize(h.slug);
      const lastmod = h.updatedAt.toISOString().split("T")[0];

      return `
        <url>
            <loc>${FRONTEND_URL}/hospital/${stateSlug}/${citySlug}/${slug}</loc>
            <lastmod>${lastmod}</lastmod>
            <priority>0.9</priority>
        </url>
      `;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${xmlItems}
  </urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
