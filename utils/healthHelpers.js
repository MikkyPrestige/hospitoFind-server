export const stripHtml = (html = "") => html.replace(/<[^>]+>/g, "").trim();

export const dedupeByTitle = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    const key = x.title?.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const OUTBREAK_KEYWORDS = [
  "outbreak",
  "epidemic",
  "pandemic",
  "virus",
  "infection",
  "infectious",
  "disease",
  "fever",
  "health alert",
  "covid",
  "flu",
  "malaria",
  "cholera",
  "ebola",
  "dengue",
  "typhoid",
  "zika",
  "yellow fever",
  "plague",
  "measles",
  "mpox",
  "health emergency",
];
