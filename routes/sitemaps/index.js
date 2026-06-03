import sitemapIndex from "./sitemapIndex.js";
import sitemapStatic from "./static.js";
import sitemapCountries from "./countries.js";
import sitemapCities from "./cities.js";
import sitemapHospitals from "./hospitals.js";
import sitemapImages from "./images.js";

export default function loadSitemapRoutes(app) {
  app.use(sitemapIndex);
  app.use(sitemapStatic);
  app.use(sitemapCountries);
  app.use(sitemapCities);
  app.use(sitemapHospitals);
  app.use(sitemapImages);
}
