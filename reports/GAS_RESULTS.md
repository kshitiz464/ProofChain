# ProofChain: gas and confirmation results

Generated from transaction receipts by the benchmark. Raw per-transaction data and hashes are in `benchmark-local.json` and, after running on Sepolia, `benchmark-sepolia.json`.

| Measurement | Local Hardhat (31337) | Public Sepolia (11155111) |
|---|---:|---:|
| Measured at (UTC) | 2026-11-03T18:41:47.550Z | Pending |
| Initial anchors | 0 | Pending |
| Successful anchors | 5/5 | Pending |
| Deployment gas | 266430 | Pending |
| Deployment fee (wei) | 499556250000000 | Pending |
| Deployment confirmation (ms) | 11 | Pending |
| Anchor gas, median | 97423 | Pending |
| Anchor fee, median (wei) | 154660751597973 | Pending |
| Anchor confirmation, median (ms) | 5 | Pending |
| Anchor confirmation, p95 (ms) | 8 | Pending |
| Verified with correct signer | 5/5 | Pending |

Sepolia benchmark has not been run. No public gas fee, confirmation time, or comparison delta is claimed.


Fee = gas used × receipt effective gas price. One confirmation is timed from sending the transaction through receipt retrieval; this includes RPC overhead and excludes IPFS and MongoDB. Hardhat automines with simulated balances. Sepolia fees use test ETH and vary with the network. The first anchor can cost more because it initializes the counter. Compare fresh deployments for like-for-like results. Median and p95 use nearest rank. Small samples describe this run only.
