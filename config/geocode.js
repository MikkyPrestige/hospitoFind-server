import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

/**
 * Get coordinates from a full address using Mapbox.
 * Retries automatically if the first attempt fails.
 * Always returns { longitude, latitude } safely.
 */
export async function getCoordinates(fullAddress, retries = 2, delay = 3000) {
  if (!fullAddress || !MAPBOX_TOKEN) {
    // console.warn("Missing address or Mapbox token");
    return { longitude: null, latitude: null };
  }

  // helper for waiting between retries
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const geoRes = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          fullAddress
        )}.json`,
        { params: { access_token: MAPBOX_TOKEN, limit: 1 }, timeout: 5000 }
      );

      const coords = geoRes.data.features[0]?.center;
      if (coords) {
        if (attempt > 1)
          // console.log(`Retried ${attempt - 1}x but succeeded: ${fullAddress}`);
        return { longitude: coords[0], latitude: coords[1] };
      } else {
        // console.warn(`No coordinates found for address: ${fullAddress}`);
        break;
      }
    } catch (err) {
      console.warn(
        `Attempt ${attempt} failed for "${fullAddress}": ${err.message}`
      );
      if (attempt <= retries) {
        await sleep(delay);
      } else {
        console.warn(
          `All ${retries + 1} attempts failed for "${fullAddress}".`
        );
      }
    }
  }

  return { longitude: null, latitude: null };
}
