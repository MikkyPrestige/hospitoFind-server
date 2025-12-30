import { logEvents } from "./logger.js";

const errorHandler = (err, req, res, next) => {
  // Include the request ID in the error log
  const requestId = req.reqId || "N/A";
 const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // Log error details with request ID
  const errorLogMsg = `${err.name}: ${err.message}\t${req.method}\t${req.url}\t${req.headers.origin}\tReqID: ${requestId}`;
  logEvents(errorLogMsg, "errLog.log");

  console.error(`ERROR [${requestId}]:`, err.stack);

  res.status(status).json({
    message: err.message || "Internal Server Error",
    isError: true,
    requestId: requestId,
  });
};

export default errorHandler;