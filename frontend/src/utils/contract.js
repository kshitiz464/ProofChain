/**
 * Ethers.js v6 utilities for connecting to MetaMask and interacting
 * with the ProofChain smart contract.
 *
 * NOTE: The frontend connects MetaMask for wallet display / identity.
 * All blockchain writes (anchor) are performed server-side by the backend.
 * This file is used only for reading from the contract directly (optional).
 */
import { ethers } from "ethers";
import ProofChainABI from "../ProofChainABI.json";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

/**
 * Request MetaMask accounts and return the provider + signer.
 * @returns {Promise<{provider: BrowserProvider, signer: JsonRpcSigner, address: string}>}
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask not detected. Please install the MetaMask browser extension."
    );
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer  = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

/**
 * Get the current connected wallet address without prompting.
 * Returns null if not connected.
 */
export async function getConnectedAddress() {
  if (!window.ethereum) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    return accounts.length > 0 ? accounts[0] : null;
  } catch {
    return null;
  }
}

/**
 * Get a read-only instance of the ProofChain contract via MetaMask provider.
 */
export async function getReadContract() {
  if (!window.ethereum) throw new Error("MetaMask not available");
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS not set");

  const provider = new ethers.BrowserProvider(window.ethereum);
  return new ethers.Contract(CONTRACT_ADDRESS, ProofChainABI, provider);
}

/**
 * Shorten an Ethereum address for display: 0x1234...5678
 */
export function shortenAddress(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Format a Unix timestamp (seconds) to a readable local date string.
 */
export function formatTimestamp(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-IN", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
