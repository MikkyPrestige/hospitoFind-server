import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import Hospital from "../models/hospitalsModel.js";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

// @desc    Get all users
// @route   GET /api/users
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").lean();
  if (!users || users.length === 0)
    return res.status(404).json({ message: "No users found" });

  res.json(users);
});

// @desc Get dashboard stats
// @route   GET /api/users/stats
// @access  Private
const getUserStats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const [total, verified] = await Promise.all([
    Hospital.countDocuments({ createdBy: userId }),
    Hospital.countDocuments({ createdBy: userId, verified: true }),
  ]);

  let level = "Beginner";
  if (total > 5) level = "Active";
  if (total > 20) level = "Directory";

  res.status(200).json({
    totalSubmissions: total,
    verifiedSubmissions: verified,
    pendingSubmissions: total - verified,
    contributorLevel: level,
  });
});

// @desc    Update user role
// @route   PATCH /api/users/role
const updateUserRole = asyncHandler(async (req, res) => {
  const { userId, newRole } = req.body;

  if (!["user", "admin"].includes(newRole)) {
    return res.status(400).json({ message: "Invalid role type" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.role = newRole;
  await user.save();

  res.json({ message: `User role updated to ${newRole}` });
});

// @desc    Update user
// @route   PATCH /users
// @access  Private
const updateUser = asyncHandler(async (req, res) => {
  const { name, username, email, password, role } = req.body;

  // Security check: Only allow the user themselves or an admin to update
  const userToUpdate = await User.findOne({ username }).exec();
  if (!userToUpdate) return res.status(404).json({ message: "User not found" });

  const isOwner = req.user === userToUpdate.username;
  const isAdmin = req.role === "admin";

  if (!isOwner && !isAdmin) {
    return res
      .status(403)
      .json({ message: "Unauthorized to update this profile" });
  }

  // Security Gate: Regular users CANNOT change their own role to admin
  if (role && role !== userToUpdate.role && !isAdmin) {
    return res
      .status(403)
      .json({ message: "Only admins can change user roles" });
  }

  // Verify password if the user is updating their own sensitive info
  if (isOwner) {
    if (!password)
      return res
        .status(400)
        .json({ message: "Current password required for security" });
    const isMatch = await bcrypt.compare(password, userToUpdate.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });
  }

  // Update fields
  if (name) userToUpdate.name = name;
  if (email) {
    const existingEmailUser = await User.findOne({ email }).exec();
    if (existingEmailUser && existingEmailUser.username !== username) {
      return res.status(409).json({ message: "Email already taken" });
    }
    userToUpdate.email = email;
  }
  if (role && isAdmin) userToUpdate.role = role;

  const updatedUser = await userToUpdate.save();

  res.status(200).json({
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
  });
});

// @desc Update Password
// @route PATCH /users/password
// @access Private
const updatePassword = asyncHandler(async (req, res) => {
  const { username, password, newPassword } = req.body;

  if (!username || !password || !newPassword) {
    return res.status(400).json({
      message: "Username, current password, and new password are required",
    });
  }

  const user = await User.findOne({ username }).exec();
  if (!user) return res.status(404).json({ message: "User does not exist" });

  if (user.auth0Id && !user.password) {
    return res.status(400).json({
      message:
        "This account uses social login. Please manage your password through your social provider's settings.",
    });
  }

  if (req.user !== user.username) {
    return res
      .status(403)
      .json({ message: "You can only change your own password" });
  }

  // Verify Old Password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid current password" });
  }

  //  Hash & Save New Password
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.status(200).json({ message: "Password updated successfully" });
});

// @desc    Delete user
// @route   DELETE /users
// @access  Private
const deleteUser = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const userToDelete = await User.findOne({ username }).exec();
  if (!userToDelete) return res.status(404).json({ message: "User not found" });

  // Only admins or the account owner can delete the account
  const isOwner = req.user === userToDelete.username;
  const isAdmin = req.role === "admin";

  if (!isOwner && !isAdmin) {
    return res
      .status(403)
      .json({ message: "Unauthorized to delete this account" });
  }

  if (isOwner) {
    const isSocialUser = userToDelete.auth0Id && !userToDelete.password;

    if (!isSocialUser) {
      if (!password) {
        return res
          .status(400)
          .json({ message: "Password required to delete account" });
      }

      const isMatch = await bcrypt.compare(password, userToDelete.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ message: "Incorrect password. Account not deleted." });
      }
    }
  }

  await userToDelete.deleteOne();
  if (isOwner) {
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "None",
      secure: true,
      domain: ".hospitofind.online",
    });
  }
  res.status(200).json({ message: `User ${username} deleted successfully` });
});

// USER ACTIVITY
// @desc    Toggle Favorite Hospital
// @route   POST /api/users/favorites
const toggleFavorite = asyncHandler(async (req, res) => {
  const { hospitalId } = req.body;
  const user = await User.findById(req.userId);

  if (!user) return res.status(404).json({ message: "User not found" });

  // Check if already favorite
  const isFav = user.favorites.includes(hospitalId);

  if (isFav) {
    // Remove it
    user.favorites = user.favorites.filter(
      (id) => id.toString() !== hospitalId
    );
  } else {
    // Add it (prevent duplicates)
    user.favorites.addToSet(hospitalId);
  }

  await user.save();
  res.status(200).json(user.favorites);
});

// @desc    Toggle hospital favorite status
// @route   POST /api/users/favorites/:hospitalId
// @access  Private
const toggleFavoriteStatus = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const userId = req.userId;

  // We use Atomic Updates ($addToSet / $pull) to avoid VersionErrors
  // 1. Check if user exists first
  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    res.status(404);
    throw new Error("User not found");
  }

  // 2. Check if currently a favorite (using a lean query for speed)
  const user = await User.findById(userId).select("favorites").lean();

  // Ensure favorites array exists to prevent crashes
  const favorites = user.favorites || [];
  // Check string comparison to be safe
  const isFavorite = favorites.some((id) => id.toString() === hospitalId);

  if (isFavorite) {
    // Atomic Remove
    await User.findByIdAndUpdate(userId, {
      $pull: { favorites: hospitalId },
    });
    res
      .status(200)
      .json({ message: "Removed from favorites", isFavorite: false });
  } else {
    // Atomic Add
    await User.findByIdAndUpdate(userId, {
      $addToSet: { favorites: hospitalId },
    });
    res.status(200).json({ message: "Added to favorites", isFavorite: true });
  }
});

// @desc    Record a View (Recent & Weekly Stats)
// @route   POST /api/users/view
const recordView = asyncHandler(async (req, res) => {
  const { hospitalId } = req.body;
  const userId = req.userId;

  // Force ID to be an ObjectId to ensure $pull finds the match
  const oid = new mongoose.Types.ObjectId(hospitalId);

  await User.findByIdAndUpdate(userId, {
    $pull: { recentlyViewed: { hospital: oid } },
  });

  await User.findByIdAndUpdate(userId, {
    $push: {
      recentlyViewed: {
        $each: [{ hospital: oid, viewedAt: new Date() }],
        $position: 0,
        $slice: 20,
      },
    },
  });

  // 2. Handle Weekly Stats (Separately to keep it simple)
  const user = await User.findById(userId).select(
    "lastWeeklyReset weeklyViewCount"
  );

  if (user) {
    const now = new Date();
    const lastReset = new Date(user.lastWeeklyReset || 0);
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    if (now - lastReset > oneWeek) {
      // Reset count
      await User.findByIdAndUpdate(userId, {
        $set: { weeklyViewCount: 1, lastWeeklyReset: now },
      });
    } else {
      // Increment count ($inc is atomic)
      await User.findByIdAndUpdate(userId, {
        $inc: { weeklyViewCount: 1 },
      });
    }
  }

  res.status(200).json({ message: "View recorded" });
});
// const recordView = asyncHandler(async (req, res) => {
//   const { hospitalId } = req.body;
//   const user = await User.findById(req.userId);

//   if (!user) return res.status(404).json({ message: "User not found" });

//   // Update Recently Viewed
//   // Remove if exists first (to move it to top)
//   user.recentlyViewed = user.recentlyViewed.filter(
//     (item) => item.hospital.toString() !== hospitalId
//   );

//   // Add to top
//   user.recentlyViewed.unshift({ hospital: hospitalId, viewedAt: new Date() });

//   // Keep max 20
//   if (user.recentlyViewed.length > 20) {
//     user.recentlyViewed = user.recentlyViewed.slice(0, 20);
//   }

//   // Update Weekly Stats
//   const now = new Date();
//   const lastReset = new Date(user.lastWeeklyReset || 0);
//   const oneWeek = 7 * 24 * 60 * 60 * 1000;

//   if (now - lastReset > oneWeek) {
//     user.weeklyViewCount = 1;
//     user.lastWeeklyReset = now;
//   } else {
//     user.weeklyViewCount += 1;
//   }

//   await user.save();
//   res.status(200).json({
//     weeklyViews: user.weeklyViewCount,
//     recentCount: user.recentlyViewed.length,
//   });
// });

// @desc    Remove a specific hospital from history
// @route   DELETE /api/users/history/:hospitalId
const removeHistoryItem = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const userId = req.userId;

  // 🛡️ STRICT FIX: Convert String ID -> ObjectId
  // This is required for $pull to work inside a nested array object
  const oid = new mongoose.Types.ObjectId(hospitalId);

  await User.findByIdAndUpdate(userId, {
    $pull: {
      recentlyViewed: { hospital: oid },
    },
  });

  res.status(200).json({ message: "Removed from history" });
});

// @desc    Remove a specific favorite (Safer than toggle for Dashboard)
// @route   DELETE /api/users/favorites/:hospitalId
const removeFavorite = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const userId = req.userId;

  // 🛡️ STRICT FIX: Convert String ID -> ObjectId
  // Even for simple arrays, this is safer
  const oid = new mongoose.Types.ObjectId(hospitalId);

  await User.findByIdAndUpdate(userId, {
    $pull: { favorites: oid },
  });

  res.status(200).json({ message: "Removed from favorites" });
});

// @desc    Clear ALL history
// @route   DELETE /api/users/history
const clearAllHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;

  await User.findByIdAndUpdate(userId, {
    $set: { recentlyViewed: [] },
  });

  res.status(200).json({ message: "History cleared" });
});

// @desc    Get All Activity (Hydrate Dashboard)
// @route   GET /api/users/activity
const getUserActivity = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .populate("favorites")
    .populate("recentlyViewed.hospital");

  if (!user) return res.status(404).json({ message: "User not found" });

  // Format recently viewed to match frontend expectation
  const formattedRecents = user.recentlyViewed
    .filter((item) => item.hospital)
    .map((item) => ({
      ...item.hospital.toObject(),
      viewedAt: item.viewedAt,
    }));

  res.status(200).json({
    favorites: user.favorites,
    recentlyViewed: formattedRecents,
    weeklyViews: user.weeklyViewCount,
  });
});

export default {
  getAllUsers,
  getUserStats,
  updateUserRole,
  updateUser,
  updatePassword,
  deleteUser,
  toggleFavorite,
  toggleFavoriteStatus,
  recordView,
removeHistoryItem,
removeFavorite,
clearAllHistory,
  getUserActivity,
};
