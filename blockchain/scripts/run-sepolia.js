const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { HDNodeWallet, isHexString } = require("ethers");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const action = process.argv[2];
if (!['deploy', 'benchmark'].includes(action)) process.exit(1);
let rpc;
try { rpc = new URL(process.env.SEPOLIA_RPC_URL); } catch { /* validation below */ }
const key = process.env.SEPOLIA_PRIVATE_KEY;
if (!rpc || rpc.protocol !== "https:" || rpc.href.includes("YOUR_") || !isHexString(key, 32)) {
  console.error("Copy blockchain/.env.example to blockchain/.env and set the HTTPS Sepolia RPC URL and dedicated test wallet key.");
  process.exit(1);
}
const defaultMnemonic = "test test test test test test test test test test test junk";
const isDefaultKey = Array.from({ length: 20 }, (_, i) => HDNodeWallet.fromPhrase(defaultMnemonic, undefined, `m/44'/60'/0'/0/${i}`).privateKey).includes(key.toLowerCase());
if (isDefaultKey) { console.error("Use a dedicated Sepolia wallet; public Hardhat keys cannot be used."); process.exit(1); }
const runner = require.resolve("hardhat/internal/cli/bootstrap");
const result = spawnSync(process.execPath, [runner, "run", `scripts/${action}.js`, "--network", "sepolia"], {
  cwd: path.join(__dirname, ".."), env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" }, stdio: "inherit",
});
process.exitCode = result.status ?? 1;
