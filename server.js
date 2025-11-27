import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { dirname } from "path";
import corsOptions from "./config/corsOptions.js";
import connectDB from "./config/db.js";
import { logger, logEvents } from "./middleware/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import rootRouter from "./routes/rootRoute.js";
import authRouter from "./routes/authRoute.js";
import userRouter from "./routes/userRoute.js";
import hospitalRouter from "./routes/hospitalsRoute.js";
import hospitalSlugRouter from "./routes/hospitalsSlugRoute.js";
import healthRouter from "./routes/healthRoute.js";
import sitemapIndex from "./routes/sitemaps/sitemapIndex.js";
import loadSitemapRoutes from "./routes/sitemaps/index.js";

const app = express();
dotenv.config();

// Resolve __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Middleware =====
app.use(logger);
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// ===== Routes =====
// Sitemaps
app.use("/", sitemapIndex);
loadSitemapRoutes(app);

// API Routes =====
app.use("/", rootRouter);
app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/hospital", hospitalSlugRouter);
app.use("/hospitals", hospitalRouter);
app.use("/health", healthRouter);

// ===== Static Files =====
app.use("/", express.static("public"));
app.use("/", express.static("public/views"));

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

app.use(errorHandler);

// ===== Server + DB Connection =====
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
});

mongoose.connection.on("error", (err) => {
  console.log(err);
  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log"
  );
});
