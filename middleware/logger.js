import ids from "short-id";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fsPromises = fs.promises;

/**
 * Write a structured JSON log entry.
 * @param {string|object} message - plain string or object to log
 * @param {string} logFileName - output file name
 * @param {string} [level='INFO'] - log level
 */
const logEvents = async (message, logFileName, level = "INFO") => {
  const timestamp = new Date().toISOString();
  const payload =
    typeof message === "string"
      ? { message, level, timestamp }
      : { ...message, level, timestamp };

  const line = JSON.stringify(payload) + "\n";

  try {
    const logDir = path.join(__dirname, "..", "logs");
    if (!fs.existsSync(logDir)) {
      await fsPromises.mkdir(logDir);
    }
    await fsPromises.appendFile(path.join(logDir, logFileName), line, "utf-8");
  } catch (err) {
    console.error("Logging Error:", err);
  }
};

/**
 * Express middleware that assigns a request ID and logs the request.
 */
const logger = (req, res, next) => {
  req.reqId = ids.generate();

  const clientIp = req.ip || req.headers["x-forwarded-for"] || "unknown-ip";
  const origin = req.headers.origin || "no-origin";

  logEvents(
    {
      message: "Incoming request",
      method: req.method,
      url: req.originalUrl,
      ip: clientIp,
      origin,
      reqId: req.reqId,
    },
    "reqLog.log",
  );
  next();
};

export { logger, logEvents };
