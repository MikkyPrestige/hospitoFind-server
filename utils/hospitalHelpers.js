// Convert Google Hours to Schema Format
export const formatHours = (googleHours) => {
  if (!googleHours || !googleHours.weekday_text) return [];
  return googleHours.weekday_text.map((text) => {
    const parts = text.split(": ");
    return {
      day: parts[0],
      open: parts.slice(1).join(": "),
    };
  });
};

// Construct Real Photo URL
export const getPhotoUrl = (photoReference, apiKey) => {
  if (!photoReference) return "";
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${apiKey}`;
};

// format hospital data from request body
export const formatHospitalData = (body) => {
  const { address, street, city, state, services, comments, hours, ...rest } =
    body;

  return {
    ...rest,
    address: {
      street: street || address?.street || "",
      city: city || address?.city || "",
      state: state || address?.state || "",
    },
    services:
      typeof services === "string"
        ? services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(services)
        ? services
        : [],
    comments: Array.isArray(comments) ? comments.filter(Boolean) : [],
    hours: Array.isArray(hours) ? hours.filter((h) => h.day && h.open) : [],
  };
};
