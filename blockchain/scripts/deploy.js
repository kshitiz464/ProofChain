const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { writeComparison } = require("./report");
const root = path.join(__dirname, "../..");
const LOCAL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function updateEnv(file, values) {
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp("^" + key + "=.*$", "m");
    content = pattern.test(content) ? content.replace(pattern, () => key + "=" + value) : content.trimEnd() + "\n" + key + "=" + value + "\n";
  }
  fs.writeFileSync(file, content.trim() + "\n");
}
async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (![31337, 11155111].includes(chainId)) throw new Error("Deployment supports local Hardhat and Sepolia only.");
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Configure SEPOLIA_PRIVATE_KEY in blockchain/.env.");
  if (chainId === 11155111 && (!process.env.SEPOLIA_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY.toLowerCase() === LOCAL_KEY)) throw new Error("Use a dedicated funded Sepolia wallet, never a public Hardhat key.");
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  if (balance === 0n) throw new Error("Fund the deployer with test ETH before deployment.");
  console.log("Network:", hre.network.name, "Chain:", chainId, "Deployer:", deployer.address);
  const started = performance.now();
  const contract = await (await hre.ethers.getContractFactory("ProofChain")).deploy();
  const receipt = await contract.deploymentTransaction().wait(1, 180000);
  const contractAddress = await contract.getAddress();
  const artifact = await hre.artifacts.readArtifact("ProofChain");
  for (const dir of ["backend/src", "frontend/src"]) fs.writeFileSync(path.join(root, dir, "ProofChainABI.json"), JSON.stringify(artifact.abi, null, 2));
  // Sepolia writes a separate backend profile; it never copies keys to the frontend.
  const backendFile = path.join(root, chainId === 11155111 ? "backend/.env.sepolia" : "backend/.env");
  if (chainId === 11155111 && !fs.existsSync(backendFile)) {
    const localFile = path.join(root, "backend/.env");
    if (fs.existsSync(localFile)) fs.copyFileSync(localFile, backendFile);
  }
  updateEnv(backendFile, {
    CONTRACT_ADDRESS: contractAddress, CHAIN_ID: chainId, DEPLOYMENT_ID: receipt.hash,
    RPC_URL: chainId === 11155111 ? process.env.SEPOLIA_RPC_URL : "http://127.0.0.1:8545",
    SIGNER_PRIVATE_KEY: chainId === 11155111 ? process.env.SEPOLIA_PRIVATE_KEY : LOCAL_KEY,
  });
  if (chainId === 31337) updateEnv(path.join(root, "frontend/.env"), { VITE_CONTRACT_ADDRESS: contractAddress });
  const record = { network: hre.network.name, chainId, contractAddress, deployer: deployer.address,
    txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
    gasPriceWei: receipt.gasPrice.toString(), feeWei: receipt.fee.toString(),
    confirmationMs: Math.round(performance.now() - started), measuredAt: new Date().toISOString() };
  const dir = path.join(root, "reports/deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, chainId + ".json"), JSON.stringify(record, null, 2) + "\n");
  writeComparison();
  console.log("Contract:", contractAddress);
  console.log("Receipt:", receipt.hash, "Gas:", record.gasUsed, "Fee (ETH):", hre.ethers.formatEther(receipt.fee));
  console.log("Backend profile updated:", path.relative(root, backendFile));
}
main().catch(error => {
  // Provider errors can contain credential-bearing RPC URLs.
  console.error("Deployment failed:", error.code || (error.message?.startsWith("Configure") || error.message?.startsWith("Fund") || error.message?.startsWith("Use ") ? error.message : "Check network, RPC configuration and test ETH balance."));
  process.exitCode = 1;
});

