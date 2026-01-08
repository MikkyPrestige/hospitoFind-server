import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import bcrypt from "bcrypt";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import {
  getCookieOptions,
  generateTokens,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../utils/authHelpers.js";

// @desc Auth0 login callback
// @route GET /auth/auth0-login
const auth0Login = asyncHandler(async (req, res) => {
  const { email, name, username, idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "ID Token is required" });
  }

  const client = new JwksClient({
    jwksUri: process.env.JWKSURI,
    cache: true,
  });

  const decodedToken = jwt.decode(idToken, { complete: true });

  if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
    return res
      .status(400)
      .json({ message: "Unable to retrieve key ID from token" });
  }

  const getKey = (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
      } else {
        const signingKey = key.getPublicKey() || key.rsaPublicKey;
        callback(null, signingKey);
      }
    });
  };

  // Verify token authenticity
  const verified = await new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        audience: process.env.AUTH0_AUDIENCE,
        issuer: process.env.AUTH0_ISSUER,
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });

  if (verified.email !== email) {
    return res.status(400).json({ message: "Email mismatch" });
  }

  let user = await User.findOne({ email }).exec();

  if (user) {
    user.isVerified = true;
    if (!user.auth0Id) user.auth0Id = verified.sub;
    if (!user.username) {
      user.username = username || email.split("@")[0];
    }
    await user.save();
  } else {
    user = await User.create({
      name,
      username: username || email.split("@")[0],
      email: email,
      role: "user",
      isVerified: true,
      auth0Id: verified.sub,
    });
  }

  // Generate tokens
  const accessToken = jwt.sign(
    {
      UserInfo: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { username: user.username },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("jwt", refreshToken, getCookieOptions());

  res.status(200).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    auth0Id: user.auth0Id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

// @desc Login
// @route POST /auth
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Please fill in all fields" });
  }

  const user = await User.findOne({
    $or: [{ email: email }, { username: email }],
  }).exec();

  if (!user) {
    return res
      .status(401)
      .json({ message: "User not found. Please check your email or sign up." });
  }

  if (user && !user.password) {
    return res.status(400).json({
      message: "This account uses Social Login. Please sign in with socials",
    });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.isVerified) {
    return res.status(403).json({
      message:
        "Your email is not verified. Please check your inbox for the link.",
    });
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("jwt", refreshToken, getCookieOptions());

  res.status(201).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

// @desc Register new user
// @route POST /auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !password || !email) {
    return res.status(400).json({ message: "Please fill in all fields" });
  }

  const existingUser = await User.findOne({ email }).exec();

  if (existingUser) {
    if (!existingUser.isVerified) {
      return res.status(409).json({
        message:
          "This email is already registered but not verified. Check your inbox or use the 'Resend Link' option.",
      });
    }
    return res.status(409).json({ message: "Email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: "user",
    isVerified: false,
    verificationToken,
    verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
  });

  if (user) {
    try {
      await sendVerificationEmail(email, name, verificationToken);
    } catch (emailError) {
      console.error("Resend Error:", emailError);
    }

    res
      .status(201)
      .json({ message: "Registration successful! Verify your email." });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
});

// @desc Verify Email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ message: "Token is required" });

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification link" });
  }

  // Activate User
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();

  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("jwt", refreshToken, getCookieOptions());

  res.status(200).json({
    message: "Email verified successfully!",
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
  });
});

// @desc Resend Verification
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(200).json({
      message:
        "If an account exists with this email, a new link has been sent.",
    });
  }

  if (user.isVerified) {
    return res.status(400).json({
      message: "This account is already verified.",
    });
  }

  // Rate Limiting (2 mins)
  const now = new Date();
  if (
    user.verificationTokenExpires &&
    user.verificationTokenExpires - now > 23 * 60 * 60 * 1000 + 58 * 60 * 1000
  ) {
    return res.status(429).json({
      message: "Please wait a few minutes before requesting another link.",
    });
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  user.verificationToken = verificationToken;
  user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  try {
    await sendVerificationEmail(email, user.name, verificationToken);
    res.status(200).json({ message: "Verification email sent!" });
  } catch (error) {
    res.status(500).json({ message: "Failed to send email." });
  }
});

// @desc Refresh token
// @route GET /auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const cookies = req.cookies;

  if (!cookies?.jwt)
    return res.status(401).json({ message: "No refresh token" });

  const refreshToken = cookies.jwt;

  jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    async (err, decoded) => {
      if (err)
        return res
          .status(403)
          .json({ message: "Token Expired or Invalid" });

      const user = await User.findOne({ username: decoded.username });

      if (!user)
        return res.status(401).json({ message: "User no longer exists" });

      // Create a NEW Access Token
      const accessToken = jwt.sign(
        {
          UserInfo: {
            username: user.username,
            role: user.role,
            id: user._id,
          },
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      res.json({
        accessToken,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        id: user._id,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }
  );
});

// @desc Forgot Password
// @route   POST /auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res
      .status(200)
      .json({ message: "If email exists, a reset link has been sent." });
  }

  // Generate Token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash and save to DB
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 Minutes
  await user.save();

  try {
    await sendPasswordResetEmail(user.email, resetToken);
    res.status(200).json({ message: "Email Sent" });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    return res.status(500).json({ message: "Email could not be sent" });
  }
});

// @desc    Reset Password
// @route   PUT /auth/reset-password/:resetToken
const resetPassword = asyncHandler(async (req, res) => {
  // Get token from URL and hash it
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resetToken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or Expired Token" });
  }

  // Set new password
  user.password = await bcrypt.hash(req.body.password, 10);
  // Clear reset fields
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res
    .status(200)
    .json({ message: "Password updated successfully! Please login." });
});

// @desc Logout
// @route POST /auth/logout
const logout = asyncHandler(async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204);

  // Clear the cookie
  res.clearCookie("jwt", getCookieOptions());

  res.status(200).json({ message: "Cookie cleared" });
});

export default {
  auth0Login,
  login,
  register,
  verifyEmail,
  resendVerification,
  refresh,
  forgotPassword,
  resetPassword,
  logout,
};
