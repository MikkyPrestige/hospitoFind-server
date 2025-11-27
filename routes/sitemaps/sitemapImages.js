import express from "express";
import Hospital from "../../models/hospitalsModel.js";

const router = express.Router();
const FRONTEND_URL = "https://hospitofind.online";

// sitemap for hospital images
router.get("/sitemap-images.xml", async (req, res) => {
  const hospitals = await Hospital.find({}, "photoUrl updatedAt").lean();

  const xmlItems = hospitals
    .filter((h) => h.photoUrl)
    .map((h) => {
      const lastmod = h.updatedAt.toISOString().split("T")[0];
      return `
        <url>
            <loc>${FRONTEND_URL}</loc>
            <image:image>
                <image:loc>${h.photoUrl}</image:loc>
                <image:lastmod>${lastmod}</image:lastmod>
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
