import express from "express";
import Hospital from "../../models/hospitalsModel.js";
// import { sanitize } from "../../config/sanitize";

const router = express.Router();

router.get("/sitemap-images.xml", async (req, res) => {
  const base = "https://hospitofind.online";

  const hospitals = await Hospital.find({}, "_id updatedAt photoUrl").lean();

  const xmlItems = hospitals
    .filter((h) => h.photoUrl)
    .map(
      (h) => `
<url>
  <loc>${base}/hospital/${h._id}</loc>
  <image:image>
    <image:loc>${h.photoUrl}</image:loc>
  </image:image>
  <lastmod>${new Date(h.updatedAt).toISOString()}</lastmod>
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
