class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
function publicError(err) {
  if (err instanceof ApiError) return err;
  if (err.code === "LIMIT_FILE_SIZE") {
    const { config } = require("./config");
    return new ApiError(413, "FILE_TOO_LARGE", `File exceeds the ${config.maxFileBytes / 1024 / 1024} MB upload limit.`);
  }
  if (err.name === "MulterError") return new ApiError(400, "INVALID_MULTIPART", "Upload exactly one file using the document field.");
  if (err.type === "entity.too.large") return new ApiError(413, "BODY_TOO_LARGE", "Request body is too large.");
  if (err.type === "entity.parse.failed") return new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  if (err.code === 11000) return new ApiError(409, "DUPLICATE_CID", "This document is already recorded.");
  return new ApiError(500, "INTERNAL_ERROR", "The request could not be completed. Check service health and try again.");
}
function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return _next(err);
  const safe = publicError(err);
  console.warn(`Request failed: ${safe.code}`);
  res.status(safe.status).json({ success: false, code: safe.code, error: safe.message, ...(safe.details ? { details: safe.details } : {}) });
}
module.exports = { ApiError, publicError, errorHandler };
