const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const { config } = require("../config");
const { ApiError } = require("../errors");
const dir = path.join(config.dataDir, "outbox");
const sort = (a, b) => Date.parse(b.anchoredAt) - Date.parse(a.anchoredAt) || (a.cid < b.cid ? -1 : Number(a.cid > b.cid));
let syncing = false;
const inFlight = new Set();
function filePath(cid) { return path.join(dir, createHash("sha256").update(`${config.networkKey}:${cid}`).digest("hex") + ".json"); }
async function write(entry) {
  await fs.mkdir(dir, { recursive: true });
  const target = filePath(entry.record.cid);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
    await fs.rename(temporary, target);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
async function entries() {
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir);
  const result = [];
  for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
    try { result.push(JSON.parse(await fs.readFile(path.join(dir, name), "utf8"))); }
    catch { console.warn("An outbox entry could not be read; preserve the data directory for recovery."); }
  }
  return result;
}
async function prepare(record) {
  // Persist intent before a transaction is submitted; disk failure stops before gas is spent.
  inFlight.add(record.cid);
  try {
    const previous = await fs.readFile(filePath(record.cid), "utf8").catch(err => { if (err.code !== "ENOENT") throw err; });
    if (previous) {
      const entry = JSON.parse(previous);
      if (entry.state === "confirmed") throw new ApiError(409, "DUPLICATE_CID", "This document is already anchored on the blockchain.");
      if (entry.state === "pending") throw new ApiError(409, "CONFIRMATION_PENDING", "This document already has a submitted transaction. Verify the CID before retrying.", { cid: record.cid, txHash: entry.record.txHash });
    }
    await write({ state: "prepared", record });
  } catch (err) {
    inFlight.delete(record.cid);
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, "RECOVERY_STORAGE_UNAVAILABLE", "Metadata recovery storage is unavailable. No blockchain transaction was sent.");
  }
}
async function submitted(record, txHash) {
  await write({ state: "pending", record: { ...record, txHash, submittedAt: new Date().toISOString() } });
}
async function confirm(record) {
  await write({ state: "confirmed", record });
  if (mongoose.connection.readyState === 1) {
    try {
      await Document.updateOne({ networkKey: record.networkKey, cid: record.cid }, { $setOnInsert: record }, { upsert: true, runValidators: true }).maxTimeMS(4000);
      await fs.unlink(filePath(record.cid)).catch(() => {});
      return "mongodb";
    } catch { /* durable outbox remains available to history and background sync */ }
  }
  return "recovery_queue";
}
async function discard(cid) { await fs.unlink(filePath(cid)).catch(() => {}); }
async function sync(recoverTransaction) {
  if (syncing) return;
  syncing = true;
  try {
    for (const entry of await entries()) {
      if (entry.record.networkKey !== config.networkKey || inFlight.has(entry.record.cid)) continue;
      if (entry.state === "pending" && recoverTransaction) {
        const receipt = await recoverTransaction(entry.record.txHash, entry.record.cid).catch(() => null);
        if (receipt?.failed) { await discard(entry.record.cid); continue; }
        if (receipt) await confirm({ ...entry.record, ...receipt });
      } else if (entry.state === "confirmed") await confirm(entry.record);
    }
  } finally { syncing = false; }
}
async function list({ page, limit, filter, matches }) {
  const local = (await entries()).filter(e => e.state === "confirmed" && e.record.networkKey === config.networkKey).map(e => e.record).filter(matches);
  const offset = (page - 1) * limit;
  let dbDocs = [], dbTotal = 0, dbStart = 0;
  let storage = "recovery_queue";
  if (mongoose.connection.readyState === 1) {
    try {
      const scoped = { ...filter, networkKey: config.networkKey, cid: { $nin: local.map(d => d.cid) } };
      dbStart = Math.max(0, offset - local.length);
      [dbDocs, dbTotal] = await Promise.all([
        Document.find(scoped).sort({ anchoredAt: -1, cid: 1 }).skip(dbStart).limit(limit + local.length).maxTimeMS(4000).lean(),
        Document.countDocuments(scoped).maxTimeMS(4000),
      ]);
      storage = local.length ? "mongodb_and_recovery_queue" : "mongodb";
    } catch { dbStart = 0; storage = "recovery_queue"; }
  }
  const total = dbTotal + local.length;
  const data = [...dbDocs, ...local].sort(sort).slice(offset - dbStart, offset - dbStart + limit);
  return { data, total, page, limit, pages: Math.ceil(total / limit), count: data.length, storage, partial: storage === "recovery_queue" };
}
async function find(cid) {
  const local = (await entries()).find(e => e.state === "confirmed" && e.record.networkKey === config.networkKey && e.record.cid === cid);
  if (local) return local.record;
  if (mongoose.connection.readyState !== 1) return null;
  try { return await Document.findOne({ networkKey: config.networkKey, cid }).maxTimeMS(4000).lean(); }
  catch { return null; }
}
function release(cid) { inFlight.delete(cid); }
module.exports = { prepare, submitted, confirm, discard, release, sync, list, find };
