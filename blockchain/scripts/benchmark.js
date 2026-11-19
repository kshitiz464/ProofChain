const { ethers, network } = require("hardhat");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { writeComparison } = require("./report");
const reportDir = path.join(__dirname, "../../reports");

// CIDv1, raw codec, sha2-256 multihash. These are synthetic benchmark IDs, not pinned files.
function syntheticCid(seed) {
  const bytes = Buffer.concat([Buffer.from([1, 0x55, 0x12, 0x20]), createHash("sha256").update(seed).digest()]);
  const bits = [...bytes].map(v => v.toString(2).padStart(8, "0")).join("");
  return "b" + bits.match(/.{1,5}/g).map(v => "abcdefghijklmnopqrstuvwxyz234567"[parseInt(v.padEnd(5, "0"), 2)]).join("");
}
async function measure(send) {
  const start = performance.now();
  const tx = await send();
  const receipt = await tx.wait(1, 180000);
  if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed");
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: receipt.gasPrice.toString(), feeWei: receipt.fee.toString(),
    confirmationMs: Math.round(performance.now() - start) };
}
async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (![31337, 11155111].includes(chainId)) throw new Error("Unsupported benchmark chain");
  const samples = Number(process.env.BENCHMARK_SAMPLES || 5);
  if (!Number.isInteger(samples) || samples < 2 || samples > 20) throw new Error("BENCHMARK_SAMPLES must be 2-20");
  const [signer] = await ethers.getSigners();
  if (!signer || await ethers.provider.getBalance(signer.address) === 0n) throw new Error("Fund a dedicated test wallet first");
  const runId = randomUUID();
  const factory = await ethers.getContractFactory("ProofChain");
  let contract, deployment = null;
  const existing = chainId === 11155111 ? process.env.BENCHMARK_CONTRACT_ADDRESS : "";
  if (existing) {
    contract = factory.attach(existing);
    if (await ethers.provider.getCode(existing) === "0x") throw new Error("Benchmark contract is missing");
    if (await contract.MAX_CID_BYTES() !== 128n) throw new Error("Benchmark requires the hardened contract");
  } else deployment = await measure(async () => { contract = await factory.deploy(); return contract.deploymentTransaction(); });
  const contractAddress = await contract.getAddress();
  const initialAnchors = Number(await contract.totalAnchored());
  const record = { measuredAt: new Date().toISOString(), network: network.name, chainId, contractAddress, runId,
    initialAnchors, deployment, attempted: samples, anchors: [], failures: [], verification: [] };
  const output = path.join(reportDir, chainId === 11155111 ? "benchmark-sepolia.json" : "benchmark-local.json");
  fs.mkdirSync(reportDir, { recursive: true });
  const persist = () => fs.writeFileSync(output, JSON.stringify(record, null, 2) + "\n");
  for (let i = 0; i < samples; i++) {
    const cid = syntheticCid(`ProofChain benchmark ${runId} ${i}`);
    try {
      const metrics = await measure(() => contract.anchor(cid));
      record.anchors.push({ cid, ...metrics });
      const start = performance.now(), [uploader, , exists] = await contract.verify(cid);
      record.verification.push({ cid, exists, correctSigner: uploader === signer.address, latencyMs: Math.round(performance.now() - start) });
      console.log(`Anchor ${i + 1}/${samples}: ${metrics.gasUsed} gas, ${metrics.feeWei} wei, ${metrics.confirmationMs} ms`);
    } catch (err) { record.failures.push({ sample: i + 1, cid, code: err.code || "TRANSACTION_FAILED" }); }
    persist();
  }
  record.unknownCidVerified = (await contract.verify(syntheticCid(`unknown ${runId}`)))[2];
  persist(); writeComparison();
  if (record.failures.length || record.unknownCidVerified || record.verification.some(x => !x.exists || !x.correctSigner)) process.exitCode = 1;
}
main().catch(err => { console.error("Benchmark failed:", err.code || "Check signer funding and RPC configuration."); process.exitCode = 1; });
