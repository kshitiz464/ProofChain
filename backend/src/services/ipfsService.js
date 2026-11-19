const axios = require("axios");
const FormData = require("form-data");
const { config } = require("../config");
const { ApiError } = require("../errors");
const { validateCid } = require("../validation");
const PINATA_API = "https://api.pinata.cloud";

async function uploadToIPFS(buffer, filename) {
  if (!process.env.PINATA_JWT || process.env.PINATA_JWT.startsWith("YOUR_")) throw new ApiError(503, "IPFS_NOT_CONFIGURED", "IPFS storage is not configured on the server.");
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: "application/octet-stream" });
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1, wrapWithDirectory: false }));
  let response;
  try {
    response = await axios.post(`${PINATA_API}/pinning/pinFileToIPFS`, form, {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, ...form.getHeaders() },
      maxContentLength: 65536, maxBodyLength: config.maxFileBytes + 16384, timeout: config.ipfsTimeoutMs,
    });
  } catch (err) {
    if (["ECONNABORTED", "ETIMEDOUT"].includes(err.code)) throw new ApiError(504, "IPFS_TIMEOUT", "IPFS storage timed out. Check connectivity and retry the document.");
    throw new ApiError(502, "IPFS_UNAVAILABLE", "IPFS storage could not accept the file. Check the server's Pinata credentials and connectivity.");
  }
  try { return await validateCid(response.data?.IpfsHash); }
  catch { throw new ApiError(502, "IPFS_INVALID_RESPONSE", "IPFS storage returned an invalid content identifier."); }
}
function getPinataUrl(cid) { return `https://gateway.pinata.cloud/ipfs/${encodeURIComponent(cid)}`; }
function getPublicUrl(cid) { return `https://ipfs.io/ipfs/${encodeURIComponent(cid)}`; }
async function testPinataConnection() {
  if (!process.env.PINATA_JWT) return false;
  try {
    await axios.get(`${PINATA_API}/data/testAuthentication`, { headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }, timeout: 5000 });
    return true;
  } catch { return false; }
}
module.exports = { uploadToIPFS, getPinataUrl, getPublicUrl, testPinataConnection };

