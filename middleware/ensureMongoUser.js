import * as Sentry from "@sentry/node";
import User from "../models/User.js";

export const ensureMongoUser = async (req, res, next) => {
  try {
    // Non-Auth0 users don't need recreation (already have a MongoDB doc)
    if (!req.auth0Id) {
      // Just verify the user still exists
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return next();
    }

    // Auth0 user: try to find by auth0Id or MongoDB id
    let user = await User.findOne({ auth0Id: req.auth0Id });
    if (!user) {
      user = await User.findById(req.userId);
    }

    if (user) {
      // User exists — make sure auth0Id is stored (backfill case)
      if (!user.auth0Id) {
        user.auth0Id = req.auth0Id;
        await user.save();
      }
      return next();
    }

    // User does not exist in MongoDB — recreate
    const newUser = await User.create({
      username: req.user,
      email: req.email,
      role: req.role || "user",
      isVerified: true,
      auth0Id: req.auth0Id,
    });

    // Log and alert that a fallback creation occurred
    console.warn(
      `ensureMongoUser: Recreated missing MongoDB user for auth0Id ${req.auth0Id}`,
    );
    Sentry.captureMessage(
      `Fallback user creation for auth0Id: ${req.auth0Id}`,
      "warning",
    );

    // Update request with the new user's ID so downstream handlers work
    req.userId = newUser._id.toString();
    req.user = newUser.username;
    req.role = newUser.role;

    next();
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
