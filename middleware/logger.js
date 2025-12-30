import { format } from "date-fns";
import ids from "short-id";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fsPromises = fs.promises;

const logEvents = async (message, logFileName) => {
  const dateTime = format(new Date(), "yyyy/MM/dd\tHH:mm:ss");
  const logItem = `${dateTime}\t${message}\n`;

  try {
    const logDir = path.join(__dirname, "..", "logs");
    if (!fs.existsSync(logDir)) {
      await fsPromises.mkdir(logDir);
    }
    await fsPromises.appendFile(path.join(logDir, logFileName), logItem);
  } catch (err) {
    console.error("Logging Error:", err);
  }
};

const logger = (req, res, next) => {
  // Generate a unique request ID
  req.reqId = ids.generate();

  const clientIp = req.ip || req.headers["x-forwarded-for"] || "unknown-ip";
  const origin = req.headers.origin || "no-origin";

  // Log the request details with the request ID included
  const logMsg = `${req.method}\t${req.url}\t${clientIp}\t${origin}\tID: ${req.reqId}`;

  logEvents(logMsg, "reqLog.log");

  console.log(`[${req.reqId}] ${req.method} ${req.path}`);
  next();
};

export { logger, logEvents };