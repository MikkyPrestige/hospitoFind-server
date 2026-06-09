import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import User from "../models/User.js";

const {
  MONGODB_URI,
  AUTH0_MGMT_CLIENT_ID,
  AUTH0_MGMT_CLIENT_SECRET,
  AUTH0_ISSUER,
} = process.env;

const AUTH0_DOMAIN = new URL(AUTH0_ISSUER).hostname;

async function getManagementApiToken() {
  const response = await axios.post(
    `https://${AUTH0_DOMAIN}/oauth/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AUTH0_MGMT_CLIENT_ID,
      client_secret: AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
      scope: "read:users",
    }),
    { headers: { "content-type": "application/x-www-form-urlencoded" } },
  );
  return response.data.access_token;
}

async function fetchAllUsers(token) {
  let users = [];
  let page = 0;
  const perPage = 100;
  let total = null;

  do {
    const response = await axios.get(`https://${AUTH0_DOMAIN}/api/v2/users`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page, per_page: perPage, include_totals: true },
    });
    users = users.concat(response.data.users);
    total = response.data.total;
    page++;
  } while (users.length < total);

  return users;
}

async function backfill() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const token = await getManagementApiToken();
    console.log("Obtained Auth0 Management API token");

    const auth0Users = await fetchAllUsers(token);
    console.log(`Fetched ${auth0Users.length} users from Auth0`);

    let created = 0;
    let skipped = 0;

    for (const auth0User of auth0Users) {
      const email = auth0User.email;
      if (!email) {
        skipped++;
        continue; // skip users without email
      }

      // Check if already in MongoDB (by auth0Id or email)
      const existing = await User.findOne({
        $or: [{ auth0Id: auth0User.user_id }, { email }],
      });

      if (existing) {
        // Backfill auth0Id if missing
        if (!existing.auth0Id) {
          existing.auth0Id = auth0User.user_id;
          await existing.save();
          console.log(`Updated auth0Id for ${email}`);
        } else {
          console.log(`Skipped (exists): ${email}`);
        }
        skipped++;
        continue;
      }

      // Derive username from email
      let baseUsername = email.split("@")[0];
      let username = baseUsername;
      let suffix = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${suffix}`;
        suffix++;
      }

      // Create minimal user
      await User.create({
        email,
        auth0Id: auth0User.user_id,
        username,
        name: auth0User.name || username,
        role: "user",
        isVerified: true,
      });

      console.log(`Created: ${email} (username: ${username})`);
      created++;
    }

    console.log(`Done. Created: ${created}, Skipped: ${skipped}`);
  } catch (err) {
    console.error("Backfill error:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

backfill();
