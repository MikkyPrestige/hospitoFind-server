import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { dirname } from "path";
import corsOptions from "./config/corsOptions.js";
import connectDB from "./config/dbConn.js";
import { logger, logEvents } from "./middleware/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import rootRoutes from "./routes/root.js";
import authRoutes from "./routes/authRoutes.js";
import healthHistoryRoutes from "./routes/healthHistoryRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import hospitalRoutes from "./routes/hospitalsRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import sitemapIndex from "./routes/sitemaps/sitemapIndex.js";
import loadSitemapRoutes from "./routes/sitemaps/index.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Security & Logging =====
app.use(logger);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/", express.static(path.join(__dirname, "public")));
app.use("/", sitemapIndex);
loadSitemapRoutes(app);
app.use("/", rootRoutes);
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/hospitals", hospitalRoutes);
app.use("/agent", agentRoutes);
app.use("/user/health-history", healthHistoryRoutes);
app.use("/health", healthRoutes);

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

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

// DB Error Logging
mongoose.connection.on("error", (err) => {
  console.error("MongoDB Connection Error:", err);
  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log",
  );
});
