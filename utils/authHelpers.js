import jwt from "jsonwebtoken";
import { Resend } from "resend";
import crypto from "node:crypto";

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const generateAccessToken = (user) => {
  const payload = {
    UserInfo: {
      id: user._id,
      username: user.username,
      role: user.role,
    },
  };
  if (user.email) payload.UserInfo.email = user.email;
  if (user.auth0Id) payload.UserInfo.auth0Id = user.auth0Id;

  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });
};

export const generateRefreshToken = (user, family) => {
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { username: user.username, family, jti },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" },
  );
  const hash = hashToken(refreshToken);
  return { refreshToken, hash };
};

export const generateTotpToken = (user) => {
  return jwt.sign(
    {
      sub: user._id,
      username: user.username,
      role: user.role,
      purpose: "totp",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
};

export const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
};

export const sendVerificationEmail = async (email, name, token) => {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await resend.emails.send({
    from: "HospitoFind <onboarding@hospitofind.online>",
    to: email,
    subject: "Verify your HospitoFind Account",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e8f0; border-radius: 12px; padding: 40px;">
        <h1 style="color: #0e3db7; text-align: center;">HospitoFind</h1>
        <h2 style="text-align: center;">Welcome, ${name}!</h2>
        <p style="text-align: center;">Please click the button below to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}"
               style="background: #0e3db7; color: white; padding: 14px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
               Verify Email Address
            </a>
        </div>
        <p style="font-size: 12px; color: #718096; text-align: center;">This link expires in 24 hours.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (email, token) => {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  await resend.emails.send({
    from: "HospitoFind <security@hospitofind.online>",
    to: email,
    subject: "Password Reset Token",
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset. Please click the link below to verify:</p>
      <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
      <p>If you did not make this request, please ignore this email.</p>
    `,
  });
};
