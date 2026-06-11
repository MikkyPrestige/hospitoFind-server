import crypto from "node:crypto";
import QRCode from "qrcode";
import { generateSecret, verify, generateURI } from "otplib";

const ENCRYPTION_KEY = () =>
  crypto.scryptSync(process.env.ACCESS_TOKEN_SECRET, "totp-salt", 32);

export const encryptSecret = (plainText) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY(), iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

export const decryptSecret = (encrypted) => {
  const [ivHex, encryptedText] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY(), iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// Generate a new TOTP secret and the corresponding otpauth URL (for QR code)
export const generateTotpSecret = (username) => {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    type: "totp",
    label: username,
    issuer: "HospitoFind",
    secret,
  });
  return { secret, otpauthUrl };
};

// Generate a QR code data URL from the otpauth URL
export const generateQRCode = async (otpauthUrl) => {
  return await QRCode.toDataURL(otpauthUrl);
};

// Verify a TOTP token against a secret
export const verifyTotpCode = (token, secret) => {
  return verify({ token, secret });
};

// Generate recovery codes (8 random hex chars each)
export const generateRecoveryCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex")); // 8-char hex
  }
  return codes;
};

// Hash a recovery code for storage
export const hashRecoveryCode = (code) => {
  return crypto.createHash("sha256").update(code).digest("hex");
};
