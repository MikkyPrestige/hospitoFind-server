import express from "express";
import Hospital from "../../models/Hospital.js";
import { sanitize } from "../../utils/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL;

// sitemap for countries based on hospitals' states
router.get("/sitemap-countries.xml", async (req, res) => {
  const states = await Hospital.distinct("address.state");

  const xmlItems = states
    .map((state) => {
      const stateSlug = sanitize(state);

      return `
        <url>
            <loc>${FRONTEND_URL}/country/${stateSlug}</loc>
            <priority>0.8</priority>
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
