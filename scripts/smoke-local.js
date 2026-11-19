// Run after compiling ProofChain. Uses its own temporary Hardhat and API ports.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { ethers } = require("../backend/node_modules/ethers");
const root = path.resolve(__dirname, "..");
const hardhatDir = path.join(root, "blockchain");
const localKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function findPort() {
  const socket = net.createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function main() {
  const artifact = require("../blockchain/artifacts/contracts/ProofChain.sol/ProofChain.json");
  const port = await findPort(), rpc = `http://127.0.0.1:${port}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proofchain-smoke-"));
  const cli = require.resolve("hardhat/internal/cli/bootstrap", { paths: [hardhatDir] });
  const child = spawn(process.execPath, [cli, "node", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: hardhatDir, windowsHide: true, stdio: "ignore", env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" },
  });
  let listener, provider, chain;
  try {
    let ready = false;
    for (let n = 0; n < 60 && child.exitCode === null; n++) {
      try {
        const response = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(1000) });
        if ((await response.json()).result === "0x7a69") { ready = true; break; }
      } catch { /* wait for JSON-RPC */ }
      await delay(500);
    }
    assert.ok(ready, "Isolated Hardhat node did not become ready");
    provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(localKey, provider);
    const deployed = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
    const receipt = await deployed.deploymentTransaction().wait();
    Object.assign(process.env, { DATA_DIR: temp, RPC_URL: rpc, CONTRACT_ADDRESS: await deployed.getAddress(),
      SIGNER_PRIVATE_KEY: localKey, CHAIN_ID: "31337", DEPLOYMENT_ID: receipt.hash });
    const { createApp } = require("../backend/src/app");
    const ipfs = require("../backend/src/services/ipfsService");
    chain = require("../backend/src/services/contractService");
    const modules = path.join(root, "backend/node_modules/multiformats/dist/src");
    const { pathToFileURL } = require("node:url");
    const { CID } = await import(pathToFileURL(path.join(modules, "cid.js")));
    const { create } = await import(pathToFileURL(path.join(modules, "hashes/digest.js")));
    const app = createApp({ ipfs: { ...ipfs, uploadToIPFS: async buffer => CID.createV1(0x55, create(0x12, createHash("sha256").update(buffer).digest())).toString() } });
    listener = app.listen(0, "127.0.0.1"); await once(listener, "listening");
    const base = `http://127.0.0.1:${listener.address().port}/api`;
    async function call(url, opts, status) {
      const response = await fetch(base + url, opts), json = await response.json();
      assert.equal(response.status, status, JSON.stringify(json));
      return json;
    }
    const upload = () => { const form = new FormData(); form.append("document", new Blob(["ProofChain local smoke sample"]), "smoke.txt"); return { method: "POST", body: form }; };
    const { data: proof } = await call("/upload", upload(), 201);
    assert.equal(proof.metadataStatus, "recovery_queue");
    assert.equal(proof.uploader, signer.address);
    assert.equal(BigInt(proof.feeWei), BigInt(proof.gasUsed) * BigInt(proof.gasPriceWei));
    assert.equal((await chain.recoverTransaction(proof.txHash, proof.cid)).txHash, proof.txHash);
    const { verified } = await call("/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid: proof.cid }) }, 200);
    assert.equal(verified, true);
    assert.equal((await call("/upload", upload(), 409)).code, "DUPLICATE_CID");
    assert.equal((await call("/documents?filename=smoke", {}, 200)).data[0].txHash, proof.txHash);
    assert.equal((await call("/health", {}, 200)).contract.totalAnchored, 1);
    console.log(`Local smoke passed: mined anchor (${proof.gasUsed} gas), receipt recovery, verification, history and duplicate rejection.`);
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    chain?.resetContract(); provider?.destroy();
    child.kill();
    if (path.dirname(path.resolve(temp)) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith("proofchain-smoke-")) await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
