const { ethers } = require("ethers");
const { config } = require("../config");
const { ApiError } = require("../errors");
let provider, signer, contract;
let writeQueue = Promise.resolve();

function getContract() {
  if (contract) return contract;
  if (!process.env.SIGNER_PRIVATE_KEY || !ethers.isAddress(config.contractAddress)) throw new ApiError(503, "CHAIN_NOT_CONFIGURED", "Blockchain signer or contract is not configured. Deploy the contract first.");
  if (config.chainId !== 31337 && process.env.SIGNER_PRIVATE_KEY.toLowerCase() === "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") throw new ApiError(503, "UNSAFE_SIGNER", "A dedicated testnet signer is required for a public network.");
  const request = new ethers.FetchRequest(process.env.RPC_URL || "http://127.0.0.1:8545");
  request.timeout = 10000;
  provider = new ethers.JsonRpcProvider(request, undefined, { pollingInterval: 1000 });
  signer = new ethers.NonceManager(new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, provider));
  contract = new ethers.Contract(config.contractAddress, require("../ProofChainABI.json"), signer);
  return contract;
}
async function checkNetwork() {
  getContract();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.chainId) throw new ApiError(503, "WRONG_NETWORK", "RPC network does not match the configured chain ID.");
  if (await provider.getCode(config.contractAddress) === "0x") throw new ApiError(503, "CONTRACT_NOT_DEPLOYED", "Contract is missing on this network. Redeploy and restart the API.");
}
function chainError(err) {
  if (err instanceof ApiError) return err;
  const reason = err.reason || err.revert?.args?.[0] || "";
  if (reason === "ProofChain: CID already anchored") return new ApiError(409, "DUPLICATE_CID", "This document is already anchored on the blockchain.");
  if (["ProofChain: empty CID", "ProofChain: CID too long"].includes(reason)) return new ApiError(422, "CONTRACT_REVERT", reason);
  if (err.code === "INSUFFICIENT_FUNDS") return new ApiError(503, "INSUFFICIENT_FUNDS", "The server's testnet signer needs more test ETH.");
  return new ApiError(503, "BLOCKCHAIN_UNAVAILABLE", "Blockchain request failed. Check RPC connectivity, contract deployment and signer funds.");
}
async function anchorDocument(cid, onSubmitted = async () => {}) {
  // Serialise signer writes to avoid concurrent nonce collisions.
  const job = writeQueue.then(async () => {
    let tx;
    try {
      await checkNetwork();
      if ((await contract.verify(cid))[2]) throw new ApiError(409, "DUPLICATE_CID", "This document is already anchored on the blockchain.");
      const started = performance.now();
      tx = await contract.anchor(cid);
      try { await onSubmitted(tx.hash); }
      catch { throw new ApiError(503, "RECOVERY_WRITE_FAILED", "The transaction was submitted but metadata recovery could not be saved. Preserve this transaction hash.", { cid, txHash: tx.hash }); }
      let receipt;
      try { receipt = await tx.wait(1, config.confirmationTimeoutMs); }
      catch (err) {
        if (err.receipt?.status === 0) throw new ApiError(422, "CONTRACT_REVERT", "The blockchain transaction reverted.", { cid, txHash: tx.hash });
        throw new ApiError(504, "CONFIRMATION_PENDING", "The transaction was submitted but confirmation is pending. Verify the CID before retrying.", { cid, txHash: tx.hash });
      }
      const block = await provider.getBlock(receipt.blockNumber);
      return {
        txHash: receipt.hash, blockNumber: receipt.blockNumber, uploader: await signer.getAddress(),
        anchoredAt: new Date(block.timestamp * 1000).toISOString(),
        gasUsed: receipt.gasUsed.toString(), gasPriceWei: receipt.gasPrice.toString(),
        feeWei: receipt.fee.toString(), confirmationMs: Math.round(performance.now() - started),
        chainId: config.chainId, contractAddress: config.contractAddress, networkKey: config.networkKey,
        explorerUrl: config.chainId === 11155111 ? `https://sepolia.etherscan.io/tx/${receipt.hash}` : null,
      };
    } catch (err) {
      signer?.reset();
      if (tx && !(err instanceof ApiError)) throw new ApiError(504, "CONFIRMATION_PENDING", "The transaction was submitted. Receipt details are temporarily unavailable; verify the CID before retrying.", { cid, txHash: tx.hash });
      throw chainError(err);
    }
  });
  writeQueue = job.catch(() => {});
  return job;
}
async function verifyDocument(cid) {
  try {
    await checkNetwork();
    const [uploader, timestamp, exists] = await contract.verify(cid);
    return { uploader, timestamp: exists ? new Date(Number(timestamp) * 1000).toISOString() : null, exists };
  } catch (err) { throw chainError(err); }
}
async function getSignerAddress() { getContract(); return signer.getAddress(); }
async function getTotalAnchored() { await checkNetwork(); return Number(await contract.totalAnchored()); }
async function recoverTransaction(txHash, cid) {
  await checkNetwork();
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return null;
  if (receipt.status !== 1 || receipt.to?.toLowerCase() !== config.contractAddress.toLowerCase()) return { failed: true };
  const anchored = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) return false;
    try { const event = contract.interface.parseLog(log); return event?.name === "AnchorCreated" && event.args.cid === cid; }
    catch { return false; }
  });
  if (!anchored) return { failed: true };
  const block = await provider.getBlock(receipt.blockNumber);
  return { txHash, blockNumber: receipt.blockNumber, uploader: receipt.from,
    anchoredAt: new Date(block.timestamp * 1000).toISOString(), gasUsed: receipt.gasUsed.toString(),
    gasPriceWei: receipt.gasPrice.toString(), feeWei: receipt.fee.toString(),
    explorerUrl: config.chainId === 11155111 ? `https://sepolia.etherscan.io/tx/${txHash}` : null };
}
function resetContract() { provider?.destroy(); provider = signer = contract = undefined; }
module.exports = { getContract, anchorDocument, verifyDocument, getSignerAddress, getTotalAnchored, recoverTransaction, resetContract, chainError };

