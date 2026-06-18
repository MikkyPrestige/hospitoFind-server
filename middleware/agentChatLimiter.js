import rateLimit from 'express-rate-limit';
import { logEvents } from './logger.js';

const agentChatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 AI chat requests per window
  message: {
    message: 'Too many AI requests. Please wait before asking again.',
  },
  handler: (req, res, next, options) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown-ip';

    logEvents(
      `AI RATE LIMIT REACHED\tIP: ${clientIp}\t${req.method}\t${req.url}\tOrigin: ${req.headers.origin}`,
      'agentLimit.log',
    );

    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
});

export default agentChatLimiter;
