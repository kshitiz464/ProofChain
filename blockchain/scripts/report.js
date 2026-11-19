const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "../../reports");
const read = name => {
  const file = path.join(root, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a < b ? -1 : Number(a > b));
  return sorted[Math.ceil(p * sorted.length) - 1]?.toString() ?? "—";
}
function writeComparison() {
  const local = read("benchmark-local.json"), testnet = read("benchmark-sepolia.json");
  const sepDeploy = read("deployments/11155111.json");
  const format = r => {
    if (!r) return Array(11).fill("Pending");
    const count = r.anchors.length;
    return [r.measuredAt, r.initialAnchors, `${count}/${r.attempted}`, r.deployment?.gasUsed ?? "Reused", r.deployment?.feeWei ?? "Reused", r.deployment?.confirmationMs ?? "Reused",
      percentile(r.anchors.map(x => BigInt(x.gasUsed)), .5), percentile(r.anchors.map(x => BigInt(x.feeWei)), .5),
      percentile(r.anchors.map(x => x.confirmationMs), .5), percentile(r.anchors.map(x => x.confirmationMs), .95),
      `${r.verification.filter(x => x.exists && x.correctSigner).length}/${count}`];
  };
  const labels = ["Measured at (UTC)", "Initial anchors", "Successful anchors", "Deployment gas", "Deployment fee (wei)", "Deployment confirmation (ms)", "Anchor gas, median", "Anchor fee, median (wei)", "Anchor confirmation, median (ms)", "Anchor confirmation, p95 (ms)", "Verified with correct signer"];
  const l = format(local), s = format(testnet);
  const lines = ["# ProofChain: gas and confirmation results", "", "Generated from transaction receipts by the benchmark. Raw per-transaction data and hashes are in `benchmark-local.json` and, after running on Sepolia, `benchmark-sepolia.json`.", "",
    "| Measurement | Local Hardhat (31337) | Public Sepolia (11155111) |", "|---|---:|---:|",
    ...labels.map((label,i) => `| ${label} | ${l[i]} | ${s[i]} |`), "",
    testnet ? `Sepolia benchmark contract: [${testnet.contractAddress}](https://sepolia.etherscan.io/address/${testnet.contractAddress}).` : "Sepolia benchmark has not been run. No public gas fee, confirmation time, or comparison delta is claimed.",
    sepDeploy ? `Sepolia deployment: [transaction receipt](https://sepolia.etherscan.io/tx/${sepDeploy.txHash}), ${sepDeploy.gasUsed} gas, ${sepDeploy.feeWei} wei, ${sepDeploy.confirmationMs} ms.` : "", "",
    "Fee = gas used × receipt effective gas price. One confirmation is timed from sending the transaction through receipt retrieval; this includes RPC overhead and excludes IPFS and MongoDB. Hardhat automines with simulated balances. Sepolia fees use test ETH and vary with the network. The first anchor can cost more because it initializes the counter. Compare fresh deployments for like-for-like results. Median and p95 use nearest rank. Small samples describe this run only.", ""];
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "GAS_RESULTS.md"), lines.join("\n"));
}
if (require.main === module) writeComparison();
module.exports = { writeComparison };
