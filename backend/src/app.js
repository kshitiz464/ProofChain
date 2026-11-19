const { config } = require("./config");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { ApiError, errorHandler } = require("./errors");
const { createDocumentRouter } = require("./routes/documents");
const chain = require("./services/contractService");
const store = require("./services/metadataStore");

function createApp(deps = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  // Explicit hop count only; never blindly trust arbitrary forwarded IPs.
  if (process.env.TRUST_PROXY_HOPS) {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 5) throw new Error("TRUST_PROXY_HOPS must be 1-5");
    app.set("trust proxy", hops);
  }
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      callback(origin && !config.corsOrigins.includes(origin) ? new ApiError(403, "ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.") : null, true);
    },
    methods: ["GET", "POST", "OPTIONS"], credentials: false,
  }));
  app.use(express.json({ limit: "4kb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  app.get("/api/config", (_req, res) => res.json({
    success: true, maxFileBytes: config.maxFileBytes,
    chainId: config.chainId, networkName: config.chainId === 11155111 ? "Sepolia" : config.chainId === 31337 ? "Local Hardhat" : `Chain ${config.chainId}`,
    contractAddress: config.contractAddress, serverAnchored: true,
  }));
  app.get("/api/health", async (_req, res) => {
    let contractInfo;
    try { contractInfo = { signerAddress: await chain.getSignerAddress(), totalAnchored: await chain.getTotalAnchored(), ready: true }; }
    catch { contractInfo = { ready: false, error: "Blockchain is unavailable or not configured." }; }
    const mongodb = ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown";
    res.json({ status: contractInfo.ready && mongodb === "connected" ? "ok" : "degraded", timestamp: new Date().toISOString(), mongodb, contract: contractInfo });
  });
  app.use("/api", createDocumentRouter(deps));
  app.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND", "API route not found.")));
  app.use(errorHandler);
  return app;
}

async function start() {
  const app = createApp();
  const server = app.listen(config.port, process.env.BIND_HOST || "127.0.0.1", () => console.log(`ProofChain API listening on port ${config.port}.`));
  server.requestTimeout = config.ipfsTimeoutMs + config.confirmationTimeoutMs + 30000;
  let stopping = false, mongoTimer;
  const uri = process.env.MONGO_URI;
  async function connectMongo() {
    if (stopping) return;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, socketTimeoutMS: 8000, dbName: "proofchain", autoIndex: true });
      console.log("MongoDB connected.");
      store.sync(chain.recoverTransaction).catch(() => console.warn("Metadata sync will retry."));
    } catch {
      console.warn("MongoDB unavailable. Check credentials and the current IP access rule in Atlas. Recovery metadata remains local.");
      mongoTimer = setTimeout(connectMongo, 10000);
    }
  }
  if (uri && !uri.includes("YOUR_")) connectMongo();
  else console.warn("MONGO_URI not configured; using durable metadata recovery storage.");
  const syncTimer = setInterval(() => store.sync(chain.recoverTransaction).catch(() => console.warn("Metadata sync will retry.")), 10000);
  async function stop() {
    stopping = true;
    clearTimeout(mongoTimer); clearInterval(syncTimer);
    server.close();
    await mongoose.disconnect();
    chain.resetContract();
  }
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  return { server, stop };
}
if (require.main === module) start().catch(() => { console.error("API startup failed. Check configuration."); process.exitCode = 1; });
module.exports = { createApp, start };

