import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";

// @desc    Get all users
// @route   GET /users
// @access  Private
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").lean()
  if (!users) return res.status(404).json({ message: "No users found" })
  res.json(users);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body
  if (!name || !username || !password || !email) {
    return res.status(400).json({ message: "Please fill in all fields" })
  }

  const duplicateUsername = await User.findOne({ username }).lean().exec()
  if (duplicateUsername) {
    return res.status(409).json({ message: "Username already taken" })
  }

  const duplicateEmail = await User.findOne({ email }).lean().exec()
  if (duplicateEmail) {
    return res.status(409).json({ message: "Email exists with another user" })
  }

  // hash password
  const hashedPassword = await bcrypt.hash(password, 10)

  // create user
  const user = await User.create({
    name,
    username,
    password: hashedPassword,
    email
  })

  res.status(201).json({ message: `${user.username} user created` })
})


export default {
  getUsers,
  createUser,
}