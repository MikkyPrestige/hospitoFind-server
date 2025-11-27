import sitemapIndex from "./sitemapIndex.js";
import sitemapStatic from "./sitemapStatic.js";
import sitemapCountries from "./sitemapCountries.js";
import sitemapCities from "./sitemapCities.js";
import sitemapHospitals from "./sitemapHospitals.js";
import sitemapImages from "./sitemapImages.js";

// Load all sitemap routes
export default function loadSitemapRoutes(app) {
  app.use(sitemapIndex);
  app.use(sitemapStatic);
  app.use(sitemapCountries);
  app.use(sitemapCities);
  app.use(sitemapHospitals);
  app.use(sitemapImages);
}
