import express from "express";

const router = express.Router();
const FRONTEND_URL = process.env.Frontend_URL;

// list of static pages to include in the sitemap
const staticPages = [
  "/",
  "/findHospital",
  "/about",
  "/country",
  "/login",
  "/signup",
  "/dashboard",
  "/nearby",
  "/news",
  "/outbreaks",
  "/dailyTips",
  "/policy",
];

// sitemap for static pages
router.get("/sitemap-static.xml", (req, res) => {
  const xmlItems = staticPages
    .map((page) => {
      return `
        <url>
            <loc>${FRONTEND_URL}${page}</loc>
            <priority>0.6</priority>
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
