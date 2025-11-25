import express from "express";
const router = express.Router();

router.get("/sitemap-static.xml", (req, res) => {
  const base = "https://hospitofind.online";

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
    "/*",
  ];

  const xmlItems = staticPages
    .map(
      (p) => `
<url>
  <loc>${base}${p}</loc>
</url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;