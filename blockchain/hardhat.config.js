require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const networks = {
  hardhat: { chainId: 31337 },
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
};
if (process.env.SEPOLIA_RPC_URL) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL, chainId: 11155111,
    accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [], timeout: 180000,
  };
}
module.exports = {
  solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks,
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};

