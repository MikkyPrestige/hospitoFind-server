export const nigeriaStates = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "FCT",
  "Abuja",
].map((state) => state.toLowerCase());

/**
 * Maps any Nigerian state to "Nigeria", otherwise returns the state name.
 */
export const normalizeCountry = (stateValue) => {
  if (!stateValue) return "Unknown";

  const trimmedState = stateValue.trim().toLowerCase();
  // If the state is in the Nigerian list, return "Nigeria"
  if (nigeriaStates.includes(trimmedState) || trimmedState === "nigeria") {
    return "Nigeria";
  }
  // Otherwise, return the original value capitalized (e.g., Ghana, Kenya)
  return stateValue.charAt(0).toUpperCase() + stateValue.slice(1);
};


// Calculate distance between two points (Haversine formula)
export const getDistance = (a, b) => {
  const R = 6371e3; // meters
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;

  const d = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
};