const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const axios = require("axios");
const { once } = require("node:events");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "proofchain-test-"));
Object.assign(process.env, { DATA_DIR: dataDir, MAX_FILE_SIZE_MB: "1", UPLOAD_RATE_LIMIT: "10", PINATA_JWT: "fake-test-token", CORS_ORIGINS: "http://localhost:5173" });
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors");
const { config } = require("../src/config");
const ipfs = require("../src/services/ipfsService");
const store = require("../src/services/metadataStore");
const { chainError } = require("../src/services/contractService");
const { createHash } = require("node:crypto");
let makeCid;
const signer = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

before(async () => {
  const { CID } = await import("multiformats/cid");
  const { create } = await import("multiformats/hashes/digest");
  makeCid = bytes => CID.createV1(0x55, create(0x12, createHash("sha256").update(bytes).digest())).toString();
});
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

async function server(t, overrides = {}) {
  const app = createApp({ ipfs: { ...ipfs, uploadToIPFS: async bytes => makeCid(bytes) }, ...overrides });
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(() => new Promise(resolve => listener.close(resolve)));
  return (route, opts) => fetch(`http://127.0.0.1:${listener.address().port}/api${route}`, opts);
}
function upload(name, bytes, field = "document") {
  const form = new FormData();
  form.append(field, new Blob([bytes]), name);
  return { method: "POST", body: form };
}
const json = data => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
async function responseIs(promise, status, code) {
  const response = await promise, body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  if (code) assert.equal(body.code, code);
  return body;
}

test("configuration is public-safe, CORS is allowlisted and Helmet headers are present", async t => {
  const call = await server(t);
  const response = await call("/config", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  const body = await response.json();
  assert.equal(body.maxFileBytes, 1048576);
  assert.doesNotMatch(JSON.stringify(body), /JWT|PRIVATE_KEY|RPC_URL|MONGO_URI|fake-test-token/);
  await responseIs(call("/config", { headers: { Origin: "https://invalid.example" } }), 403, "ORIGIN_NOT_ALLOWED");
});

test("invalid multipart, empty files, size limits, CIDs and filters return JSON errors", async t => {
  const call = await server(t);
  await responseIs(call("/upload", upload("empty.txt", "")), 400, "INVALID_INPUT");
  await responseIs(call("/upload", upload("wrong.txt", "hello", "wrong")), 400, "INVALID_MULTIPART");
  await responseIs(call("/upload", upload("large.txt", Buffer.alloc(1048577))), 413, "FILE_TOO_LARGE");
  await responseIs(call("/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data" }, body: "broken" }), 400, "INVALID_MULTIPART");
  await responseIs(call("/verify", json({ cid: { $ne: "" } })), 400, "INVALID_INPUT");
  await responseIs(call("/verify", json({ cid: "https://invalid.example/path" })), 400, "INVALID_INPUT");
  await responseIs(call("/documents?limit=1000"), 400, "INVALID_INPUT");
  await responseIs(call("/documents?from=2026-02-30"), 400, "INVALID_INPUT");
  await responseIs(call("/documents?from=2026-10-01&to=2026-09-30"), 400, "INVALID_INPUT");
  await responseIs(call("/documents?uploader=someone"), 400, "INVALID_INPUT");
});

test("IPFS timeout and provider failure return safe actionable errors; revert strings are allowlisted", async t => {
  const call = await server(t, { ipfs });
  t.mock.method(axios, "post", async () => { throw Object.assign(new Error("fake-test-token"), { code: "ECONNABORTED" }); });
  const timedOut = await responseIs(call("/upload", upload("timeout.txt", "content")), 504, "IPFS_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(timedOut), /fake-test-token/);
  axios.post.mock.mockImplementation(async () => { throw new Error("private RPC or auth header"); });
  const badGateway = await responseIs(call("/upload", upload("broken.txt", "content")), 502, "IPFS_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(badGateway), /private RPC/);
  assert.equal(chainError({ reason: "ProofChain: CID too long" }).status, 422);
  assert.equal(chainError({ reason: "ProofChain: CID already anchored" }).status, 409);
  assert.doesNotMatch(chainError({ reason: "ProofChain: private RPC token" }).message, /private RPC token/);
});

test("confirmed uploads survive MongoDB outage, duplicate retry, filtering and pagination", async t => {
  const receipts = new Map();
  const chain = {
    async anchorDocument(cid, submit) {
      const n = receipts.size + 1;
      const txHash = "0x" + n.toString(16).padStart(64, "0");
      await submit(txHash);
      const receipt = { uploader: signer, txHash, blockNumber: n, anchoredAt: `2026-11-0${n}T13:00:00.000Z`, gasUsed: "100000", feeWei: "100000000000000" };
      receipts.set(cid, receipt);
      return receipt;
    },
    async verifyDocument(cid) { return { exists: receipts.has(cid), uploader: signer, timestamp: receipts.get(cid)?.anchoredAt }; },
  };
  const call = await server(t, { chain });
  const first = await responseIs(call("/upload", upload("alpha[1].gs", "alpha")), 201);
  assert.equal(first.data.metadataStatus, "recovery_queue");
  assert.match(first.warning, /saved locally/);
  await responseIs(call("/upload", upload("alpha duplicate.gs", "alpha")), 409, "DUPLICATE_CID");
  assert.equal(receipts.size, 1);
  const second = await responseIs(call("/upload", upload("second.pdf", Buffer.alloc(1048576))), 201);
  const result = await responseIs(call("/documents?page=1&limit=1"), 200);
  assert.equal(result.total, 2); assert.equal(result.pages, 2); assert.equal(result.partial, true);
  assert.equal(result.data[0].cid, second.data.cid);
  assert.equal((await responseIs(call("/documents?page=2&limit=1"), 200)).data[0].cid, first.data.cid);
  const filtered = await responseIs(call(`/documents?filename=%5B1%5D&uploader=${signer}&from=2026-11-01&to=2026-11-01`), 200);
  assert.deepEqual(filtered.data.map(x => x.cid), [first.data.cid]);
  assert.equal((await responseIs(call("/verify", json({ cid: first.data.cid })), 200)).verified, true);
  assert.equal((await responseIs(call("/verify", json({ cid: makeCid("modified") })), 200)).verified, false);
  assert.equal((await responseIs(call(`/documents/${first.data.cid}`), 200)).data.filename, "alpha[1].gs");
});

test("pending transaction can be recovered to history after confirmation", async t => {
  const cid = makeCid("pending transaction");
  const txHash = "0x" + "a".repeat(64);
  const call = await server(t, { chain: { async anchorDocument(value, onSubmitted) {
    await onSubmitted(txHash);
    throw new ApiError(504, "CONFIRMATION_PENDING", "Confirmation pending", { cid: value, txHash });
  } } });
  const pending = await responseIs(call("/upload", upload("pending.txt", "pending transaction")), 504, "CONFIRMATION_PENDING");
  assert.deepEqual(pending.details, { cid, txHash });
  await responseIs(call(`/documents/${cid}`), 404, "NOT_FOUND");
  await responseIs(call("/upload", upload("pending.txt", "pending transaction")), 409, "CONFIRMATION_PENDING");
  await store.sync(async (hash, value) => ({ txHash: hash, cid: value, uploader: signer, anchoredAt: "2026-11-03T10:00:00.000Z", blockNumber: 5 }));
  assert.equal((await responseIs(call(`/documents/${cid}`), 200)).data.txHash, txHash);
});

test("upload attempts are rate limited before parsing files", async t => {
  const call = await server(t);
  for (let i = 0; i < config.uploadRateLimit; i++) await responseIs(call("/upload", json({})), 400, "INVALID_INPUT");
  const limited = await call("/upload", upload("file.txt", "will not pin"));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "RATE_LIMITED");
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});
