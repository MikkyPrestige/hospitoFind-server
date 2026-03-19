import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Fetch country → continent from RestCountries API
// ─────────────────────────────────────────────────────────────────────────────

const SOUTH_AMERICA_COUNTRIES = new Set([
  "brazil",
  "argentina",
  "colombia",
  "chile",
  "peru",
  "venezuela",
  "ecuador",
  "bolivia",
  "paraguay",
  "uruguay",
  "guyana",
  "suriname",
  "french guiana",
  "falkland islands",
]);

const MIDDLE_EAST_COUNTRIES = new Set([
  "iran",
  "iraq",
  "saudi arabia",
  "united arab emirates",
  "israel",
  "jordan",
  "lebanon",
  "syria",
  "yemen",
  "oman",
  "kuwait",
  "qatar",
  "bahrain",
  "palestine",
  "state of palestine",
]);

const fetchCountryContinent = async () => {
  console.log("🌐 Fetching country data from RestCountries API...");

  try {
    const res = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,region",
    );

    if (!res.ok) throw new Error(`RestCountries API returned ${res.status}`);

    const countries = await res.json();
    const map = {};

    for (const country of countries) {
      const name = country.name?.common;
      let region = country.region;
      if (!name || !region || region === "Antarctic") continue;

      const nameLower = name.toLowerCase();

      if (region === "Americas") {
        region = SOUTH_AMERICA_COUNTRIES.has(nameLower)
          ? "South America"
          : "North America";
      }

      if (region === "Asia" && MIDDLE_EAST_COUNTRIES.has(nameLower)) {
        region = "Middle East";
      }

      map[nameLower] = region;
    }

    console.log(`✅ Loaded ${Object.keys(map).length} countries from API\n`);
    return map;
  } catch (err) {
    console.warn(`⚠️  RestCountries API failed: ${err.message}`);
    console.warn("   Falling back to minimal hardcoded map...\n");

    return {
      nigeria: "Africa",
      ghana: "Africa",
      kenya: "Africa",
      "south africa": "Africa",
      ethiopia: "Africa",
      tanzania: "Africa",
      uganda: "Africa",
      senegal: "Africa",
      togo: "Africa",
      "burkina faso": "Africa",
      angola: "Africa",
      eritrea: "Africa",
      niger: "Africa",
      morocco: "Africa",
      egypt: "Africa",
      botswana: "Africa",
      gambia: "Africa",
      "ivory coast": "Africa",
      germany: "Europe",
      france: "Europe",
      "united kingdom": "Europe",
      netherlands: "Europe",
      austria: "Europe",
      poland: "Europe",
      serbia: "Europe",
      cyprus: "Europe",
      turkey: "Europe",
      switzerland: "Europe",
      belgium: "Europe",
      denmark: "Europe",
      sweden: "Europe",
      spain: "Europe",
      italy: "Europe",
      malta: "Europe",
      "united states": "North America",
      canada: "North America",
      brazil: "South America",
      pakistan: "Asia",
      india: "Asia",
      china: "Asia",
      japan: "Asia",
      "south korea": "Asia",
      singapore: "Asia",
      philippines: "Asia",
      thailand: "Asia",
      "new zealand": "Oceania",
      australia: "Oceania",
      "saudi arabia": "Middle East",
      "united arab emirates": "Middle East",
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Spelling fixes + name standardisation
// ─────────────────────────────────────────────────────────────────────────────
const SPELLING_FIXES = {
  philippine: "Philippines",
  philipppines: "Philippines",
  filipinas: "Philippines",
  "republic of the philippines": "Philippines",

  "côte d'ivoire": "Ivory Coast",
  "côte d'ivoire": "Ivory Coast",
  "cote d'ivoire": "Ivory Coast",
  "cote divoire": "Ivory Coast",
  "la côte d'ivoire": "Ivory Coast",

  türkiye: "Turkey",
  turkiye: "Turkey",
  "republic of turkey": "Turkey",
  "republic of türkiye": "Turkey",

  burma: "Myanmar",
  "republic of the union of myanmar": "Myanmar",

  swaziland: "Eswatini",
  "kingdom of eswatini": "Eswatini",

  macedonia: "North Macedonia",
  fyrom: "North Macedonia",
  "former yugoslav republic of macedonia": "North Macedonia",

  "democratic republic of congo": "DR Congo",
  "democratic republic of the congo": "DR Congo",
  drc: "DR Congo",
  "dr congo": "DR Congo",
  zaire: "DR Congo",
  "republic of congo": "Republic of the Congo",
  "republic of the congo": "Republic of the Congo",

  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  "u.a.e": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",

  usa: "United States",
  "united states of america": "United States",
  america: "United States",
  "u.s.a": "United States",
  "u.s.a.": "United States",
  "u.s.": "United States",

  uk: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  "u.k.": "United Kingdom",
  "u.k": "United Kingdom",

  korea: "South Korea",
  "republic of korea": "South Korea",
  rok: "South Korea",

  dprk: "North Korea",
  "democratic people's republic of korea": "North Korea",

  "the gambia": "Gambia",
  "republic of the gambia": "Gambia",

  "state of palestine": "Palestine",
  "west bank": "Palestine",
  gaza: "Palestine",

  "islamic republic of iran": "Iran",
  persia: "Iran",

  "russian federation": "Russia",

  "viet nam": "Vietnam",
  "socialist republic of vietnam": "Vietnam",

  "plurinational state of bolivia": "Bolivia",

  "united republic of tanzania": "Tanzania",

  "bolivarian republic of venezuela": "Venezuela",

  "czech republic": "Czechia",

  "cabo verde": "Cape Verde",
};

// ─────────────────────────────────────────────────────────────────────────────
// Connect
// ─────────────────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found. Check your .env file.");
  process.exit(1);
}

console.log("🔌 Connecting to MongoDB...");
await mongoose.connect(MONGODB_URI);
console.log("✅ Connected\n");

const Hospital = mongoose.model(
  "Hospital",
  new mongoose.Schema({}, { strict: false, collection: "hospitals" }),
);

// Fetch in parallel
const [hospitals, countryContinent] = await Promise.all([
  Hospital.find({}).lean(),
  fetchCountryContinent(),
]);

console.log(`📋 Found ${hospitals.length} hospitals in DB\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Analyse countries
// ─────────────────────────────────────────────────────────────────────────────
const countryCounts = {};
for (const h of hospitals) {
  const country = h.address?.state || "UNKNOWN";
  countryCounts[country] = (countryCounts[country] || 0) + 1;
}

console.log("🌍 Countries found in your DB:");
const sorted = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
for (const [country, count] of sorted) {
  const fixed = SPELLING_FIXES[country.toLowerCase()] || country;
  const continent = countryContinent[fixed.toLowerCase()];
  const wasFixed = fixed.toLowerCase() !== country.toLowerCase();
  const status = continent
    ? `→ ${continent}${wasFixed ? ` (will fix: "${country}" → "${fixed}")` : ""}`
    : "⚠️  NOT FOUND in API";
  console.log(`   ${country} (${count}) ${status}`);
}
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Build bulk ops
// ─────────────────────────────────────────────────────────────────────────────
const bulkOps = [];
const unmapped = [];
let spellingFixed = 0;
let continentSet = 0;
let alreadyDone = 0;

for (const h of hospitals) {
  const rawCountry = h.address?.state || "";
  const fixedCountry = SPELLING_FIXES[rawCountry.toLowerCase()] || rawCountry;
  const continent = countryContinent[fixedCountry.toLowerCase()];
  const needsFix = fixedCountry.toLowerCase() !== rawCountry.toLowerCase();

  // Skip garbage/test data
  if (!rawCountry || rawCountry.toLowerCase() === "tttt") continue;

  // Already done and no spelling fix needed
  if (h.continent && !needsFix) {
    alreadyDone++;
    continue;
  }

  if (!continent) {
    unmapped.push({ name: h.name, country: rawCountry });
    continue;
  }

  const setPayload = { continent };
  if (needsFix) {
    setPayload["address.state"] = fixedCountry;
    spellingFixed++;
  }

  bulkOps.push({
    updateOne: {
      filter: { _id: h._id },
      update: { $set: setPayload },
    },
  });
  continentSet++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log("📊 Migration summary:");
console.log(`   ✅ Will update:        ${continentSet} hospitals`);
console.log(`   ✏️  Spelling fixes:     ${spellingFixed} hospitals`);
console.log(`   ⏭️  Already complete:   ${alreadyDone} hospitals`);
console.log(`   ⚠️  Unmapped/skipped:   ${unmapped.length} hospitals\n`);

if (unmapped.length > 0) {
  console.log("⚠️  These hospitals could not be mapped:");
  unmapped.forEach(({ name, country }) => {
    console.log(`   - "${name}" → country: "${country}"`);
  });
  console.log("\n   Add them to SPELLING_FIXES above and re-run the script.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────────────────────
if (bulkOps.length === 0) {
  console.log("✨ Nothing to update — all hospitals already have a continent.");
} else {
  console.log(`🚀 Running bulk update for ${bulkOps.length} hospitals...`);
  const result = await Hospital.bulkWrite(bulkOps);
  console.log(`✅ Done!`);
  console.log(`   Modified:        ${result.modifiedCount} hospitals`);
  if (spellingFixed > 0) {
    console.log(`   Spellings fixed: ${spellingFixed} hospitals`);
  }
}

await mongoose.disconnect();
console.log("\n🔌 Disconnected. Migration complete.");
process.exit(0);
