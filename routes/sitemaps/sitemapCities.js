import express from "express";
import Hospital from "../../models/hospitalsModel.js";
import { sanitize } from "../../config/sanitize.js";

const router = express.Router();
const FRONTEND_URL = process.env.Frontend_URL;
  // sitemap for cities based on hospitals' addresses
  router.get("/sitemap-cities.xml", async (req, res) => {
    const hospitals = await Hospital.find(
      {},
      "address.state address.city"
    ).lean();

    const unique = new Set();

    hospitals.forEach((h) => {
      if (h.address?.state && h.address?.city) {
        unique.add(`${sanitize(h.address.state)}|${sanitize(h.address.city)}`);
      }
    });

    const xmlItems = [...unique]
      .map((pair) => {
        const [stateSlug, citySlug] = pair.split("|");

        return `
        <url>
            <loc>${FRONTEND_URL}/country/${stateSlug}/${citySlug}</loc>
            <priority>0.7</priority>
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
