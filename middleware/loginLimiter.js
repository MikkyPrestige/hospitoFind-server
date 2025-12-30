import rateLimit from "express-rate-limit";
import { logEvents } from "./logger.js";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login requests per `window`
  message: {
    message:
      "Too many login attempts from this IP, please try again after 15 minutes",
  },
  handler: (req, res, next, options) => {
   const clientIp =
     req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown-ip";

    // Log the rate limit event with client IP and request details included
    const logMsg = `LIMIT REACHED\tIP: ${clientIp}\t${req.method}\t${req.url}\tOrigin: ${req.headers.origin}`;
    logEvents(logMsg, "loginLimit.log");

    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipFailedRequests: true,
});

export default loginLimiter;