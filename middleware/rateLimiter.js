import rateLimit from "express-rate-limit";

export const hospitalSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5,
  message: {
    message:
      "Too many hospital submissions from this IP, please try again after an hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const osmImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3,
  message: {
    message: "Too many OSM import requests. Please wait before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
