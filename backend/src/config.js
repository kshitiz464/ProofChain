const path = require("node:path");
const { isAddress } = require("ethers");
require("dotenv").config({ path: process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(__dirname, "../.env"), quiet: true });
function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
const config = {
  port: integer("PORT", 5000, 1, 65535),
  maxFileBytes: integer("MAX_FILE_SIZE_MB", 50, 1, 100) * 1024 * 1024,
  ipfsTimeoutMs: integer("IPFS_TIMEOUT_MS", 60000, 1000, 300000),
  confirmationTimeoutMs: integer("CONFIRMATION_TIMEOUT_MS", 180000, 1000, 600000),
  uploadRateLimit: integer("UPLOAD_RATE_LIMIT", 10, 1, 10000),
  rateWindowMs: integer("RATE_WINDOW_MS", 60000, 1000, 3600000),
  maxConcurrentUploads: integer("MAX_CONCURRENT_UPLOADS", 2, 1, 10),
  chainId: integer("CHAIN_ID", 31337, 1, Number.MAX_SAFE_INTEGER),
  contractAddress: isAddress(process.env.CONTRACT_ADDRESS || "") ? process.env.CONTRACT_ADDRESS : "",
  deploymentId: process.env.DEPLOYMENT_ID || "legacy",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",").map(s => s.trim()).filter(Boolean),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "../data"),
};
config.networkKey = `${config.chainId}:${config.contractAddress.toLowerCase()}:${config.deploymentId}`;
module.exports = { config, integer };
