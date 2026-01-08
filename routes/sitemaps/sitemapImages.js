import express from "express";
import Hospital from "../../models/Hospital.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL;

// Escape invalid XML characters
const xmlEscape = (str = "") =>
  str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// sitemap for hospital images
router.get("/sitemap-images.xml", async (req, res) => {
  const hospitals = await Hospital.find(
    {},
    "slug address.photoUrl address.city address.state updatedAt photoUrl"
  ).lean();

  const xmlItems = hospitals
    .filter((h) => h.photoUrl)
    .map((h) => {
      const lastmod = h.updatedAt.toISOString().split("T")[0];
      const state = xmlEscape(h.address.state.toLowerCase());
      const city = xmlEscape(h.address.city.toLowerCase());
      const slug = xmlEscape(h.slug);
      const imageUrl = xmlEscape(h.photoUrl);

      const hospitalPage = `${FRONTEND_URL}/hospital/${state}/${city}/${slug}`;

      return `
        <url>
            <loc>${hospitalPage}</loc>
            <lastmod>${lastmod}</lastmod>
            <image:image>
                <image:loc>${imageUrl}</image:loc>
            </image:image>
        </url>
      `;
    })
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
