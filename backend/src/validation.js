const { isAddress } = require("ethers");
const { ApiError } = require("./errors");
function invalid(message) { throw new ApiError(400, "INVALID_INPUT", message); }
function text(value, name, max = 200) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f]/.test(value)) invalid(`${name} must be plain text of at most ${max} characters.`);
  return value.trim();
}
async function validateCid(value) {
  const cid = text(value, "CID", 128);
  try {
    const { CID } = await import("multiformats/cid");
    CID.parse(cid);
  } catch { invalid("Provide a valid IPFS CID (CIDv0 or base32 CIDv1), without a URL or path."); }
  return cid;
}
function validateFile(file) {
  if (!file || !file.size) invalid("Choose a non-empty document to upload.");
  const { config } = require("./config");
  if (file.size > config.maxFileBytes) throw new ApiError(413, "FILE_TOO_LARGE", `File exceeds the ${config.maxFileBytes / 1024 / 1024} MB upload limit.`);
  if (!file.originalname || file.originalname.length > 255 || /[\x00-\x1f/\\]/.test(file.originalname)) invalid("Filename must be at most 255 characters and contain no paths or control characters.");
}
function parseHistoryQuery(query) {
  const pageText = text(query.page, "page", 8) || "1";
  const limitText = text(query.limit, "limit", 3) || "10";
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) invalid("page and limit must be positive integers.");
  const page = Number(pageText), limit = Number(limitText);
  if (page < 1 || page > 10000 || limit < 1 || limit > 50) invalid("page must be 1-10000 and limit must be 1-50.");
  const q = text(query.q, "search");
  const filename = text(query.filename, "filename");
  const uploader = text(query.uploader, "uploader", 42);
  if (uploader && !isAddress(uploader)) invalid("Uploader must be a complete Ethereum address.");
  const from = text(query.from, "from date", 10), to = text(query.to, "to date", 10);
  for (const value of [from, to]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) invalid("Dates must be valid YYYY-MM-DD dates (UTC).");
  }
  if (from && to && from > to) invalid("Start date must be on or before end date.");
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {};
  if (q) filter.$or = ["filename", "cid", "uploader"].map(key => ({ [key]: { $regex: escape(q), $options: "i" } }));
  if (filename) filter.filename = { $regex: escape(filename), $options: "i" };
  if (uploader) filter.uploader = uploader.toLowerCase();
  if (from || to) {
    filter.anchoredAt = {};
    if (from) filter.anchoredAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.anchoredAt.$lt = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000);
  }
  const matches = doc => {
    const at = Date.parse(doc.anchoredAt);
    return (!q || [doc.filename,doc.cid,doc.uploader].some(v => String(v).toLowerCase().includes(q.toLowerCase()))) &&
      (!filename || doc.filename.toLowerCase().includes(filename.toLowerCase())) &&
      (!uploader || doc.uploader.toLowerCase() === uploader.toLowerCase()) &&
      (!from || at >= Date.parse(`${from}T00:00:00Z`)) &&
      (!to || at < Date.parse(`${to}T00:00:00Z`) + 86400000);
  };
  return { page, limit, filter, matches };
}
module.exports = { validateCid, validateFile, parseHistoryQuery };
