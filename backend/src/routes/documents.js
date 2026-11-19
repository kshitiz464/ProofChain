const express = require("express");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const { config } = require("../config");
const { ApiError } = require("../errors");
const { validateCid, validateFile, parseHistoryQuery } = require("../validation");
const ipfs = require("../services/ipfsService");
const chain = require("../services/contractService");
const store = require("../services/metadataStore");
const { extname } = require("node:path");
const previewTypes = { ".gs": "text/plain", ".txt": "text/plain", ".html": "text/html", ".md": "text/plain", ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

function createDocumentRouter(deps = {}) {
  const storage = deps.store || store, blockchain = deps.chain || chain, pinning = deps.ipfs || ipfs;
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileBytes + 1, files: 1, fields: 1, fieldSize: 256, parts: 2 },
  });
  const limiter = rateLimit({
    windowMs: config.rateWindowMs, limit: config.uploadRateLimit, standardHeaders: "draft-8", legacyHeaders: false,
    message: { success: false, code: "RATE_LIMITED", error: "Too many requests. Wait before uploading or verifying another file." },
  });
  let active = 0;
  const locks = new Set();
  function capacity(req, res, next) {
    if (active >= config.maxConcurrentUploads) return next(new ApiError(503, "UPLOAD_BUSY", "Upload capacity is busy. Please retry shortly."));
    active++;
    let released = false;
    const release = () => { if (!released) { active--; released = true; } };
    // Hold the slot through the complete asynchronous pipeline, including client disconnects.
    req.releaseUploadSlot = release;
    res.once("finish", release);
    next();
  }
  const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next).finally(() => req.releaseUploadSlot?.());
  const parseFile = (req, res, next) => upload.single("document")(req, res, err => {
    if (err) req.releaseUploadSlot();
    next(err && !(err instanceof multer.MulterError) ? new ApiError(400, "INVALID_MULTIPART", "The upload request is malformed. Choose one document and retry.") : err);
  });

  router.post("/upload", limiter, capacity, parseFile, asyncRoute(async (req, res) => {
    validateFile(req.file);
    const { originalname: filename, buffer, size: fileSize, mimetype } = req.file;
    const mimeType = previewTypes[extname(filename).toLowerCase()] || mimetype;
    const cid = await pinning.uploadToIPFS(buffer, filename);
    if (locks.has(cid)) throw new ApiError(409, "UPLOAD_IN_PROGRESS", "This document is already being anchored. Verify its CID before retrying.", { cid });
    locks.add(cid);
    let sent = false, prepared = false;
    try {
      const record = { filename, cid, fileSize, mimeType, ipfsUrl: pinning.getPinataUrl(cid),
        networkKey: config.networkKey, chainId: config.chainId, contractAddress: config.contractAddress };
      await storage.prepare(record);
      prepared = true;
      const proof = await blockchain.anchorDocument(cid, async txHash => {
        sent = true;
        await storage.submitted(record, txHash);
      });
      const data = { ...record, ...proof };
      let metadataStatus;
      try { metadataStatus = await storage.confirm(data); }
      catch { metadataStatus = "recovery_pending"; }
      res.status(201).json({ success: true, data: { ...data, metadataStatus },
        warning: metadataStatus === "recovery_queue" ? "Blockchain proof is confirmed. Metadata is saved locally and will sync when MongoDB reconnects." :
          metadataStatus === "recovery_pending" ? "Blockchain proof is confirmed. History could not be updated yet; save the CID and transaction hash." : undefined });
    } catch (err) {
      if (prepared && !sent) await storage.discard(cid);
      throw err;
    } finally { storage.release?.(cid); locks.delete(cid); }
  }));

  router.get("/documents", asyncRoute(async (req, res) => {
    res.json({ success: true, ...await storage.list(parseHistoryQuery(req.query)) });
  }));
  router.post("/verify", limiter, capacity, parseFile, asyncRoute(async (req, res) => {
    if (req.file && req.body?.cid) throw new ApiError(400, "INVALID_INPUT", "Provide a file or a CID, not both.");
    let cid;
    if (req.file) {
      validateFile(req.file);
      cid = await pinning.uploadToIPFS(req.file.buffer, req.file.originalname);
    } else cid = await validateCid(req.body?.cid);
    const proof = await blockchain.verifyDocument(cid);
    if (!proof.exists) return res.json({ success: true, verified: false, cid, message: "No proof of existence was found on this blockchain." });
    const doc = await storage.find(cid);
    res.json({ success: true, verified: true, cid, uploader: proof.uploader, timestamp: proof.timestamp,
      filename: doc?.filename || null, txHash: doc?.txHash || null, fileSize: doc?.fileSize || null,
      ipfsUrl: pinning.getPinataUrl(cid), explorerUrl: doc?.explorerUrl || null,
      message: "Document verified on blockchain." });
  }));
  router.get("/documents/:cid", asyncRoute(async (req, res) => {
    const cid = await validateCid(req.params.cid), doc = await storage.find(cid);
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document metadata is not available for this deployment.");
    res.json({ success: true, data: doc });
  }));
  return router;
}
module.exports = { createDocumentRouter };

