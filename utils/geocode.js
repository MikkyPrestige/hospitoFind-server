import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

/**
 * Get coordinates from a full address using Mapbox.
 * Retries automatically if the first attempt fails due to network issues.
 * Stops immediately if the token is invalid.
 * @param {string} fullAddress - The formatted address string.
 * @param {number} retries - Number of retry attempts.
 * @param {number} delay - Time to wait between retries (ms).
 * @returns {Promise<{longitude: number|null, latitude: number|null}>}
 */

export async function getCoordinates(fullAddress, retries = 2, delay = 3000) {
  if (
    !fullAddress ||
    typeof fullAddress !== "string" ||
    fullAddress.trim() === ""
  ) {
    console.error("Geocoding Error: No address provided.");
    return { longitude: null, latitude: null };
  }

  if (!MAPBOX_TOKEN) {
    console.error(
      "Geocoding Error: Missing MAPBOX_TOKEN in environment variables."
    );
    return { longitude: null, latitude: null };
  }

  // Helper for waiting between retries
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Geocoding Logic with Retry Loop
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const geoRes = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          fullAddress.trim()
        )}.json`,
        {
          params: {
            access_token: MAPBOX_TOKEN,
            limit: 1,
          },
          timeout: 5000, // 5 second timeout per request
        }
      );

      const features = geoRes.data?.features;

      // Check for Successful Match
      if (features && features.length > 0) {
        const coords = features[0].center; // Mapbox returns [longitude, latitude]

        if (attempt > 1) {
          console.log(
            `Geocode Success: Succeeded on attempt ${attempt} for "${fullAddress}"`
          );
        }

        return {
          longitude: coords[0],
          latitude: coords[1],
        };
      } else {
        console.warn(
          `Geocode Warning: No location results for "${fullAddress}"`
        );
        break;
      }
    } catch (err) {
      const status = err.response?.status;

      // Handle API Errors
      if (status === 401 || status === 403) {
        console.error(
          "CRITICAL: Mapbox Token is invalid, expired, or unauthorized. Stopping retries."
        );
        break;
      }

      if (status === 429) {
        console.warn(
          `Geocode Warning: Rate limit hit (429). Attempt ${attempt} failed.`
        );
      } else {
        console.warn(
          `Geocode Attempt ${attempt} failed for "${fullAddress}": ${err.message}`
        );
      }

      // Decide to Retry or Give Up
      if (attempt <= retries) {
        console.log(`Waiting ${delay}ms before next retry...`);
        await sleep(delay);
      } else {
        console.error(
          `Geocode Error: All ${
            retries + 1
          } attempts failed for "${fullAddress}".`
        );
      }
    }
  }

  // 6. Final Fallback
  return { longitude: null, latitude: null };
}