const COUNTRY_CONTINENT = {
  // ── Africa
  nigeria: "Africa",
  ghana: "Africa",
  kenya: "Africa",
  "south africa": "Africa",
  ethiopia: "Africa",
  tanzania: "Africa",
  "united republic of tanzania": "Africa",
  uganda: "Africa",
  rwanda: "Africa",
  cameroon: "Africa",
  senegal: "Africa",
  togo: "Africa",
  "burkina faso": "Africa",
  angola: "Africa",
  mozambique: "Africa",
  zambia: "Africa",
  zimbabwe: "Africa",
  botswana: "Africa",
  namibia: "Africa",
  egypt: "Africa",
  morocco: "Africa",
  tunisia: "Africa",
  algeria: "Africa",
  libya: "Africa",
  sudan: "Africa",
  "south sudan": "Africa",
  somalia: "Africa",
  eritrea: "Africa",
  benin: "Africa",
  "sierra leone": "Africa",
  liberia: "Africa",
  "guinea-bissau": "Africa",
  "guinea bissau": "Africa",
  guinea: "Africa",
  "equatorial guinea": "Africa",
  "dr congo": "Africa",
  drc: "Africa",
  "democratic republic of congo": "Africa",
  "democratic republic of the congo": "Africa",
  zaire: "Africa",
  "republic of the congo": "Africa",
  "republic of congo": "Africa",
  congo: "Africa",
  "central african republic": "Africa",
  chad: "Africa",
  gabon: "Africa",
  malawi: "Africa",
  lesotho: "Africa",
  eswatini: "Africa",
  swaziland: "Africa",
  madagascar: "Africa",
  mauritius: "Africa",
  seychelles: "Africa",
  comoros: "Africa",
  djibouti: "Africa",
  burundi: "Africa",
  niger: "Africa",
  mali: "Africa",
  gambia: "Africa",
  "the gambia": "Africa",
  "ivory coast": "Africa",
  "côte d'ivoire": "Africa",
  "côte d'ivoire": "Africa",
  "cote d'ivoire": "Africa",
  "cote divoire": "Africa",
  "cape verde": "Africa",
  "cabo verde": "Africa",
  "sao tome and principe": "Africa",
  "são tomé and príncipe": "Africa",
  mayotte: "Africa",
  reunion: "Africa",

  // ── Europe
  germany: "Europe",
  france: "Europe",
  "united kingdom": "Europe",
  uk: "Europe",
  "u.k.": "Europe",
  "great britain": "Europe",
  britain: "Europe",
  england: "Europe",
  scotland: "Europe",
  wales: "Europe",
  "northern ireland": "Europe",
  italy: "Europe",
  spain: "Europe",
  portugal: "Europe",
  netherlands: "Europe",
  belgium: "Europe",
  switzerland: "Europe",
  austria: "Europe",
  sweden: "Europe",
  norway: "Europe",
  denmark: "Europe",
  finland: "Europe",
  poland: "Europe",
  "czech republic": "Europe",
  czechia: "Europe",
  slovakia: "Europe",
  hungary: "Europe",
  romania: "Europe",
  bulgaria: "Europe",
  greece: "Europe",
  turkey: "Europe",
  türkiye: "Europe",
  turkiye: "Europe",
  ukraine: "Europe",
  russia: "Europe",
  "russian federation": "Europe",
  ireland: "Europe",
  croatia: "Europe",
  serbia: "Europe",
  luxembourg: "Europe",
  malta: "Europe",
  cyprus: "Europe",
  iceland: "Europe",
  latvia: "Europe",
  lithuania: "Europe",
  estonia: "Europe",
  moldova: "Europe",
  belarus: "Europe",
  albania: "Europe",
  montenegro: "Europe",
  "north macedonia": "Europe",
  macedonia: "Europe",
  fyrom: "Europe",
  "bosnia and herzegovina": "Europe",
  "bosnia & herzegovina": "Europe",
  slovenia: "Europe",
  kosovo: "Europe",
  liechtenstein: "Europe",
  monaco: "Europe",
  "san marino": "Europe",
  "vatican city": "Europe",

  // ── North America
  "united states": "North America",
  "united states of america": "North America",
  usa: "North America",
  "u.s.a": "North America",
  "u.s.a.": "North America",
  "u.s.": "North America",
  america: "North America",
  canada: "North America",
  mexico: "North America",
  cuba: "North America",
  haiti: "North America",
  "dominican republic": "North America",
  jamaica: "North America",
  "trinidad and tobago": "North America",
  barbados: "North America",
  guatemala: "North America",
  honduras: "North America",
  "el salvador": "North America",
  nicaragua: "North America",
  "costa rica": "North America",
  panama: "North America",
  belize: "North America",
  bahamas: "North America",
  "puerto rico": "North America",

  // ── South America
  brazil: "South America",
  argentina: "South America",
  colombia: "South America",
  chile: "South America",
  peru: "South America",
  venezuela: "South America",
  "bolivarian republic of venezuela": "South America",
  ecuador: "South America",
  bolivia: "South America",
  "plurinational state of bolivia": "South America",
  paraguay: "South America",
  uruguay: "South America",
  guyana: "South America",
  suriname: "South America",

  // ── Asia
  india: "Asia",
  china: "Asia",
  japan: "Asia",
  "south korea": "Asia",
  korea: "Asia",
  "republic of korea": "Asia",
  rok: "Asia",
  "north korea": "Asia",
  "democratic people's republic of korea": "Asia",
  dprk: "Asia",
  indonesia: "Asia",
  pakistan: "Asia",
  bangladesh: "Asia",
  vietnam: "Asia",
  "viet nam": "Asia",
  thailand: "Asia",
  malaysia: "Asia",
  singapore: "Asia",
  philippines: "Asia",
  myanmar: "Asia",
  burma: "Asia",
  cambodia: "Asia",
  laos: "Asia",
  nepal: "Asia",
  "sri lanka": "Asia",
  afghanistan: "Asia",
  kazakhstan: "Asia",
  uzbekistan: "Asia",
  tajikistan: "Asia",
  kyrgyzstan: "Asia",
  turkmenistan: "Asia",
  "hong kong": "Asia",
  taiwan: "Asia",
  mongolia: "Asia",
  "timor-leste": "Asia",
  "east timor": "Asia",
  brunei: "Asia",
  georgia: "Asia",
  armenia: "Asia",
  azerbaijan: "Asia",

  // ── Middle East
  iran: "Middle East",
  "islamic republic of iran": "Middle East",
  persia: "Middle East",
  iraq: "Middle East",
  "saudi arabia": "Middle East",
  ksa: "Middle East",
  "united arab emirates": "Middle East",
  uae: "Middle East",
  emirates: "Middle East",
  "u.a.e": "Middle East",
  "u.a.e.": "Middle East",
  israel: "Middle East",
  jordan: "Middle East",
  lebanon: "Middle East",
  syria: "Middle East",
  yemen: "Middle East",
  oman: "Middle East",
  kuwait: "Middle East",
  qatar: "Middle East",
  bahrain: "Middle East",
  palestine: "Middle East",
  "state of palestine": "Middle East",
  "west bank": "Middle East",
  gaza: "Middle East",

  // ── Oceania
  australia: "Oceania",
  "new zealand": "Oceania",
  "new zealand": "Oceania",
  "papua new guinea": "Oceania",
  fiji: "Oceania",
  "solomon islands": "Oceania",
  vanuatu: "Oceania",
  samoa: "Oceania",
  tonga: "Oceania",
};

const getUserContinent = (location) => {
  if (!location) return null;
  const lower = location.toLowerCase().trim();
  const sorted = Object.keys(COUNTRY_CONTINENT).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sorted) {
    if (lower.includes(key)) return COUNTRY_CONTINENT[key];
  }
  return null;
};

const SYMPTOM_SERVICE_MAP = {
  "chest pain": ["cardiology", "cardiac", "heart", "emergency", "icu"],
  heart: ["cardiology", "cardiac", "heart"],
  palpitation: ["cardiology", "cardiac"],
  breathing: ["pulmonology", "respiratory", "chest", "emergency"],
  cough: ["pulmonology", "respiratory", "general"],
  asthma: ["pulmonology", "respiratory"],
  headache: ["neurology", "general", "emergency"],
  seizure: ["neurology", "emergency"],
  stroke: ["neurology", "emergency"],
  dizziness: ["neurology", "general", "ear nose throat"],
  sleepiness: ["neurology", "general", "sleep"],
  stomach: ["gastroenterology", "general", "surgery"],
  vomiting: ["gastroenterology", "general", "emergency"],
  diarrhea: ["gastroenterology", "general"],
  diarrhoea: ["gastroenterology", "general"],
  ulcer: ["gastroenterology", "general"],
  bone: ["orthopaedics", "orthopedics", "trauma", "surgery"],
  fracture: ["orthopaedics", "orthopedics", "trauma", "emergency"],
  joint: ["orthopaedics", "orthopedics", "rheumatology"],
  "back pain": ["orthopaedics", "physiotherapy", "general"],
  child: ["paediatrics", "pediatrics", "general"],
  baby: ["paediatrics", "pediatrics", "neonatal"],
  infant: ["paediatrics", "pediatrics", "neonatal"],
  pregnant: ["obstetrics", "maternity", "gynaecology", "gynecology"],
  labour: ["obstetrics", "maternity", "emergency"],
  labor: ["obstetrics", "maternity", "emergency"],
  delivery: ["obstetrics", "maternity"],
  eye: ["ophthalmology", "eye", "general"],
  ear: ["ear nose throat", "ent", "general"],
  throat: ["ear nose throat", "ent", "general"],
  skin: ["dermatology", "general"],
  rash: ["dermatology", "general"],
  diabetes: ["endocrinology", "general", "internal medicine"],
  sugar: ["endocrinology", "general"],
  mental: ["psychiatry", "psychology", "mental health"],
  anxiety: ["psychiatry", "psychology", "mental health"],
  depression: ["psychiatry", "psychology", "mental health"],
  malaria: ["general", "infectious disease", "emergency"],
  fever: ["general", "emergency", "infectious disease"],
  typhoid: ["general", "infectious disease"],
  tuberculosis: ["pulmonology", "infectious disease"],
  pain: ["general", "emergency"],
  emergency: ["emergency", "trauma", "general", "icu"],
  accident: ["emergency", "trauma", "surgery"],
  obesity: ["general", "endocrinology", "nutrition"],
  overweight: ["general", "endocrinology", "nutrition"],
  overfed: ["general", "endocrinology", "nutrition"],
  smoking: ["general", "pulmonology", "respiratory"],
  alcohol: ["general", "psychiatry"],
};

export const symptomsToServices = (symptoms) => {
  const services = new Set();
  const lower = symptoms.map((s) => s.toLowerCase());
  for (const [keyword, list] of Object.entries(SYMPTOM_SERVICE_MAP)) {
    if (lower.some((s) => s.includes(keyword))) {
      list.forEach((svc) => services.add(svc.toLowerCase()));
    }
  }
  services.add("general");
  return Array.from(services);
};

const scoreServices = (hospital, serviceKeywords) => {
  const text = [
    hospital.name,
    hospital.type,
    ...(hospital.services || []),
    ...(hospital.comments || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matched = serviceKeywords.filter((kw) => text.includes(kw));
  if (!matched.length) return { score: 0, reason: null };

  const score = Math.min(50, matched.length * 15);
  const display = matched.find((s) => s !== "general") || matched[0];
  return { score, reason: `Offers ${display} services` };
};

const parseLocationTerms = (location) => {
  if (!location) return [];
  const lower = location.toLowerCase().trim();
  const words = lower.split(/[\s,]+/).filter((t) => t.length > 1);
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }
  return [...words, ...phrases];
};

const fieldMatches = (fieldValue, locationTerms) => {
  if (!fieldValue) return false;
  const lower = fieldValue.toLowerCase();
  return locationTerms.some((t) => lower.includes(t) || t.includes(lower));
};

const shapeResult = (hospital, serviceScore, serviceReason, locationLabel) => {
  const reasons = [];
  if (serviceReason) reasons.push(serviceReason);
  if (locationLabel) reasons.push(locationLabel);
  if (hospital.verified) reasons.push("Verified facility");

  return {
    _id: hospital._id,
    name: hospital.name,
    slug: hospital.slug,
    type: hospital.type,
    city: hospital.address?.city,
    state: hospital.address?.state,
    country: hospital.address?.state,
    continent: hospital.continent,
    street: hospital.address?.street,
    phoneNumber: hospital.phoneNumber,
    email: hospital.email,
    website: hospital.website,
    photoUrl: hospital.photoUrl,
    verified: hospital.verified,
    isFeatured: hospital.isFeatured,
    services: hospital.services || [],
    latitude: hospital.latitude,
    longitude: hospital.longitude,
    matchScore: Math.min(
      serviceScore +
        (hospital.verified ? 10 : 0) +
        (hospital.phoneNumber ? 5 : 0),
      100,
    ),
    matchReason: reasons.length
      ? reasons.join(" · ")
      : "General healthcare facility",
  };
};

export const matchHospitals = (profile, hospitals, topN = 5) => {
  const serviceKeywords = symptomsToServices(profile.symptoms || []);
  const locationTerms = parseLocationTerms(profile.location);
  const userContinent = getUserContinent(profile.location);

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];

  for (const hospital of hospitals) {
    const { score: svcScore, reason: svcReason } = scoreServices(
      hospital,
      serviceKeywords,
    );
    const city = hospital.address?.city || "";
    const country = hospital.address?.state || "";

    // Tier 1 — city match
    if (locationTerms.length && fieldMatches(city, locationTerms)) {
      tier1.push(shapeResult(hospital, svcScore, svcReason, `In ${city}`));
      continue;
    }

    // Tier 2 — country match
    if (locationTerms.length && fieldMatches(country, locationTerms)) {
      tier2.push(shapeResult(hospital, svcScore, svcReason, `In ${country}`));
      continue;
    }

    // Tier 3 — continent match via DB field (no lookup needed)
    if (
      userContinent &&
      hospital.continent &&
      hospital.continent === userContinent
    ) {
      tier3.push(
        shapeResult(
          hospital,
          svcScore,
          svcReason,
          `In ${country} (${userContinent})`,
        ),
      );
    }
  }

  const byScore = (a, b) => b.matchScore - a.matchScore;
  tier1.sort(byScore);
  tier2.sort(byScore);
  tier3.sort(byScore);

  const results = [];
  for (const r of [...tier1, ...tier2, ...tier3]) {
    if (results.length >= topN) break;
    results.push(r);
  }

  if (!results.length) {
    const regionLabel = userContinent || profile.location || "your area";
    return {
      results: [],
      noResults: true,
      region: regionLabel,
      message: `We couldn't find hospitals in ${regionLabel} matching your needs. Our coverage in this region is still growing — browse our full directory in the meantime.`,
    };
  }

  return { results, noResults: false };
};
