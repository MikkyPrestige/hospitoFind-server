import dotenv from "dotenv";
dotenv.config();
import * as Sentry from "@sentry/node";
import express from "express";
import { Router } from "express";
import mongoose from "mongoose";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { dirname } from "path";
import corsOptions from "./config/corsOptions.js";
import { logger } from "./middleware/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import rootRoutes from "./routes/root.js";
import authRoutes from "./routes/authRoutes.js";
import healthHistoryRoutes from "./routes/healthHistoryRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import hospitalRoutes from "./routes/hospitalsRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import loadSitemapRoutes from "./routes/sitemaps/index.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.1, // capture 10% of transactions for performance monitoring
});

const app = express();
const api = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Security & common middleware
app.use(logger);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/", express.static(path.join(__dirname, "public")));

// SITEMAPS
loadSitemapRoutes(app);

// ROUTES
api.use("/auth", authRoutes);
api.use("/user", userRoutes);
api.use("/admin", adminRoutes);
api.use("/hospitals", hospitalRoutes);
api.use("/agent", agentRoutes);
api.use("/user/health-history", healthHistoryRoutes);
api.use("/health", healthRoutes);

app.use("/api/v1", api);

// Temporary: keep old routes active for backward compatibility
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/hospitals", hospitalRoutes);
app.use("/agent", agentRoutes);
app.use("/user/health-history", healthHistoryRoutes);
app.use("/health", healthRoutes);

app.use("/", rootRoutes);

app.get("/ping", (req, res) => {
  res.status(200).send("Server is awake");
});

// ===== 404 Handling =====
app.all("*", (req, res) => {
  res.status(404);
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "public", "views", "404.html"));
  } else if (req.accepts("json")) {
    res.json({ message: "404 Not Found" });
  } else {
    res.type("txt").send("404 Not Found");
  }
});

// ===== Global Error Handler =====
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

export default app;
