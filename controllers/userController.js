import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import Hospital from "../models/hospitalsModel.js";
import asyncHandler from "express-async-handler";

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

  let level = "Beginner Contributor";
  if (total > 5) level = "Active Contributor";
  if (total > 20) level = "Directory Expert";

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
      message: "Username, old password, and new password are required",
    });
  }

  const user = await User.findOne({ username }).exec();
  if (!user) return res.status(404).json({ message: "User does not exist" });

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

  await userToDelete.deleteOne();
  res.status(200).json({ message: `User ${username} deleted` });
});

export default {
  getAllUsers,
  getUserStats,
  updateUserRole,
  updateUser,
  updatePassword,
  deleteUser,
};
