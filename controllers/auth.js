import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import bcrypt from 'bcrypt';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import {
  getCookieOptions,
  generateAccessToken,
  generateRefreshToken,
  generateTotpToken,
  hashToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../utils/authHelpers.js';
import { decryptSecret, verifyTotpCode, hashRecoveryCode } from '../utils/totpHelpers.js';

/**
 * @desc    Auth0 login
 * @route   POST /auth/auth0-login
 * @access  Public
 */
const auth0Login = asyncHandler(async (req, res) => {
  const { email, name, username, idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'ID Token is required' });
  }

  const client = new JwksClient({
    jwksUri: process.env.JWKSURI,
    cache: true,
  });

  const decodedToken = jwt.decode(idToken, { complete: true });

  if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
    return res.status(400).json({ message: 'Unable to retrieve key ID from token' });
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
        algorithms: ['RS256'],
        audience: process.env.AUTH0_AUDIENCE,
        issuer: process.env.AUTH0_ISSUER,
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      },
    );
  });

  if (verified.email !== email) {
    return res.status(400).json({ message: 'Email mismatch' });
  }

  let user = await User.findOne({ email }).exec();

  if (user) {
    user.isVerified = true;
    if (!user.auth0Id) user.auth0Id = verified.sub;
    if (!user.username) {
      user.username = username || email.split('@')[0];
    }
    await user.save();
  } else {
    user = await User.create({
      name,
      username: username || email.split('@')[0],
      email: email,
      role: 'user',
      isVerified: true,
      auth0Id: verified.sub,
    });
  }

  // Check if TOTP is required
  if (user.totpEnabled) {
    const totpToken = generateTotpToken(user);
    return res.status(200).json({
      totpToken,
      message: 'TOTP code required',
    });
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const family = crypto.randomUUID();
  const { refreshToken, hash } = generateRefreshToken(user, family);
  user.refreshTokenHash = hash;
  user.refreshTokenFamily = family;
  await user.save();

  res.cookie('jwt', refreshToken, getCookieOptions());

  res.status(200).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    auth0Id: user.auth0Id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * @desc    Login
 * @route   POST /auth
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please fill in all fields' });
  }

  const user = await User.findOne({
    $or: [{ email: email }, { username: email }],
  }).exec();

  if (!user) {
    return res.status(400).json({ message: 'User not found. Please check your email or sign up.' });
  }

  if (user && !user.password) {
    return res.status(400).json({
      message: 'This account uses Social Login. Please sign in with socials',
    });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  if (!user.isVerified) {
    return res.status(403).json({
      message: 'Your email is not verified. Please check your inbox for the link.',
    });
  }

  // Check if TOTP is required
  if (user.totpEnabled) {
    const totpToken = generateTotpToken(user);
    return res.status(200).json({
      totpToken,
      message: 'TOTP code required',
    });
  }

  const accessToken = generateAccessToken(user);
  const family = crypto.randomUUID();
  const { refreshToken, hash } = generateRefreshToken(user, family);
  user.refreshTokenHash = hash;
  user.refreshTokenFamily = family;
  await user.save();

  res.cookie('jwt', refreshToken, getCookieOptions());

  res.status(201).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * @desc    Register new user
 * @route   POST /auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !password || !email) {
    return res.status(400).json({ message: 'Please fill in all fields' });
  }

  const existingUser = await User.findOne({ email }).exec();

  if (existingUser) {
    if (!existingUser.isVerified) {
      return res.status(409).json({
        message:
          "This email is already registered but not verified. Check your inbox or use the 'Resend Link' option.",
      });
    }
    return res.status(409).json({ message: 'Email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const verificationToken = crypto.randomBytes(32).toString('hex');

  const user = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: 'user',
    totpEnabled: false,
    isVerified: false,
    verificationToken,
    verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
  });

  if (user) {
    try {
      await sendVerificationEmail(email, name, verificationToken);
    } catch (emailError) {
      console.error('Resend Error:', emailError);
    }

    res.status(201).json({ message: 'Registration successful! Verify your email.' });
  } else {
    res.status(400).json({ message: 'Invalid user data' });
  }
});

/**
 * @desc    Verify Email
 * @route   GET /auth/verify-email
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ message: 'Token is required' });

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired verification link' });
  }

  // Activate User
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;

  const accessToken = generateAccessToken(user);
  const family = crypto.randomUUID();
  const { refreshToken, hash } = generateRefreshToken(user, family);
  user.refreshTokenHash = hash;
  user.refreshTokenFamily = family;
  await user.save();

  res.cookie('jwt', refreshToken, getCookieOptions());

  res.status(200).json({
    message: 'Email verified successfully!',
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
  });
});

/**
 * @desc    Resend verification email
 * @route   POST /auth/resend-verification
 * @access  Public
 */
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(200).json({
      message: 'If an account exists with this email, a new link has been sent.',
    });
  }

  if (user.isVerified) {
    return res.status(400).json({
      message: 'This account is already verified.',
    });
  }

  // Rate Limiting (2 mins)
  const now = new Date();
  if (
    user.verificationTokenExpires &&
    user.verificationTokenExpires - now > 23 * 60 * 60 * 1000 + 58 * 60 * 1000
  ) {
    return res.status(429).json({
      message: 'Please wait a few minutes before requesting another link.',
    });
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.verificationToken = verificationToken;
  user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  try {
    await sendVerificationEmail(email, user.name, verificationToken);
    res.status(200).json({ message: 'Verification email sent!' });
  } catch {
    res.status(500).json({ message: 'Failed to send email.' });
  }
});

/**
 * @desc    Refresh Access Token
 * @route   GET /auth/refresh
 * @access  Public (requires refresh token cookie)
 */
const refresh = asyncHandler(async (req, res) => {
  const cookies = req.cookies;

  if (!cookies?.jwt) return res.status(400).json({ message: 'No refresh token' });

  const oldRefreshToken = cookies.jwt;

  let decoded;
  try {
    decoded = jwt.verify(oldRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    return res.status(400).json({ message: 'Token Expired or Invalid' });
  }

  const user = await User.findOne({ username: decoded.username });

  if (!user) return res.status(400).json({ message: 'User no longer exists' });

  if (!user.refreshTokenHash || !user.refreshTokenFamily) {
    // No stored token – either legacy or previously revoked
    return res.status(401).json({ message: 'Please login again' });
  }

  const providedHash = hashToken(oldRefreshToken);

  if (providedHash !== user.refreshTokenHash) {
    // Reuse detected – revoke all sessions
    user.refreshTokenHash = undefined;
    user.refreshTokenFamily = undefined;
    await user.save();
    res.clearCookie('jwt', getCookieOptions());
    return res.status(401).json({ message: 'Token reuse detected. Please login again.' });
  }

  // Valid token – rotate it
  const family = user.refreshTokenFamily;
  const { refreshToken: newRefreshToken, hash: newHash } = generateRefreshToken(user, family);
  user.refreshTokenHash = newHash;
  await user.save();

  const accessToken = generateAccessToken(user);

  res.cookie('jwt', newRefreshToken, getCookieOptions());

  res.json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    id: user._id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * @desc    Complete TOTP login
 * @route   POST /auth/totp-login
 * @access  Public
 */
const totpLogin = asyncHandler(async (req, res) => {
  const { totpToken, code, recoveryCode } = req.body;

  if (!totpToken || (!code && !recoveryCode)) {
    return res.status(400).json({ message: 'TOTP token and code or recovery code required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(totpToken, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    return res.status(400).json({ message: 'Invalid or expired TOTP token' });
  }

  if (decoded.purpose !== 'totp') {
    return res.status(400).json({ message: 'Invalid token purpose' });
  }

  const user = await User.findById(decoded.sub);
  if (!user) return res.status(400).json({ message: 'User not found' });
  if (!user.totpEnabled) return res.status(400).json({ message: 'TOTP not enabled' });

  if (code) {
    // Verify TOTP code
    const secret = decryptSecret(user.totpSecret);
    const valid = verifyTotpCode(code, secret);
    if (!valid) return res.status(400).json({ message: 'Invalid TOTP code' });
  } else if (recoveryCode) {
    // Verify recovery code
    const hashed = hashRecoveryCode(recoveryCode);
    const index = user.recoveryCodes.indexOf(hashed);
    if (index === -1) return res.status(400).json({ message: 'Invalid recovery code' });
    // Remove used recovery code
    user.recoveryCodes.splice(index, 1);
  } else {
    return res.status(400).json({ message: 'Code or recovery code required' });
  }

  // Issue real tokens
  const accessToken = generateAccessToken(user);
  const family = crypto.randomUUID();
  const { refreshToken, hash } = generateRefreshToken(user, family);
  user.refreshTokenHash = hash;
  user.refreshTokenFamily = family;
  await user.save();

  res.cookie('jwt', refreshToken, getCookieOptions());

  res.status(200).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    id: user._id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * @desc    Forgot Password
 * @route   POST /auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(200).json({ message: 'If email exists, a reset link has been sent.' });
  }

  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash and save to DB
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 Minutes
  await user.save();

  try {
    await sendPasswordResetEmail(user.email, resetToken);
    res.status(200).json({ message: 'Email Sent' });
  } catch {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    return res.status(500).json({ message: 'Email could not be sent' });
  }
});

/**
 * @desc    Reset Password
 * @route   PUT /auth/reset-password/:resetToken
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or Expired Token' });
  }

  user.password = await bcrypt.hash(req.body.password, 10);

  // Clear reset fields
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.status(200).json({ message: 'Password updated successfully! Please login.' });
});

/**
 * @desc    Logout
 * @route   POST /auth/logout
 * @access  Public
 */
const logout = asyncHandler(async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204);

  const refreshToken = cookies.jwt;
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findOne({ username: decoded.username });
    if (user) {
      user.refreshTokenHash = undefined;
      user.refreshTokenFamily = undefined;
      await user.save();
    }
  } catch {
    // token invalid or expired, just clear cookie
  }

  res.clearCookie('jwt', getCookieOptions());
  res.status(200).json({ message: 'Logged out' });
});

export default {
  auth0Login,
  login,
  register,
  verifyEmail,
  resendVerification,
  refresh,
  totpLogin,
  forgotPassword,
  resetPassword,
  logout,
};
