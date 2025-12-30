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
 * Normalizes a state value to a Country label.
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
