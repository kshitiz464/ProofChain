# ProofChain reliability and gas report

**Run:** 4 November 2026 (India Standard Time). The implementation was exercised locally. Public Sepolia execution is deferred until the operator configures a funded dedicated test wallet and RPC URL.

| Check | Observed outcome | Evidence |
|---|---|---|
| Contract proof and event | 12 tests passed: caller and block timestamp, event, duplicate rejection, empty/oversized CIDs and independent verification. | `cd blockchain; npm test` |
| Input and capacity controls | Empty/wrong field/malformed file returns 400, a file over the configured limit returns 413, an exact-limit file succeeds, and excess requests return 429 with retry guidance. | `cd backend; npm test` |
| Provider faults and secret handling | Simulated Pinata timeout returns 504 and other Pinata failure returns 502; errors omit provider details. Invalid origins are rejected; the allowed origin receives CORS headers and Helmet headers are present. | API tests |
| MongoDB outage | A confirmed anchor returns 201 and appears in the recovery queue; duplicate retry preserves metadata; filename/address/date filters and page navigation work against queued records. | API tests |
| Pending chain receipt | A pending write returns its CID and hash, remains out of confirmed history, and appears after a matching receipt is reconciled. | API tests |
| Local RPC integration | A live, isolated Hardhat node mined an API anchor, returned receipt gas/fee, verified the CID, and rejected a duplicate. Pinata was simulated and MongoDB was offline. | `node scripts/smoke-local.js` after compiling the contract |
| Frontend build and browser smoke | Production bundle builds. Headless Chrome with fixture API responses exercised file-size rejection, filters, pagination, sandboxed HTML preview, the IPFS download URL, mobile layout and CID verification. Live gateway rendering depends on browser and gateway availability. | `cd frontend; npm run build`; local browser smoke |

The tests do not measure Pinata or Atlas uptime, and simulated failures are not production incident data. The gas benchmark excludes both services. The latest per-receipt measurements, timestamp and definitions are in [Gas results](GAS_RESULTS.md) and [the local benchmark JSON](benchmark-local.json). In the local run, all five anchors verified. Deployment used 266,430 gas, the first anchor used 114,523 gas, and each later anchor used 97,423 gas. The difference includes initialization of the anchor count. Median time to one confirmation was 5 ms; this reflects Hardhat automining, so it should not be extrapolated to a public network.

## Dependency and environment audit

| Package scope | Low | Moderate | High | Critical | Action |
|---|---:|---:|---:|---:|---|
| [Backend](audit/backend.json) | 0 | 0 | 0 | 0 | Upgraded Express and Multer; removed the extra development watcher; applied compatible audit fixes. |
| [Frontend](audit/frontend.json) | 0 | 1 | 1 | 0 | Remaining findings are in Vite's development toolchain. `npm audit --omit=dev` found zero. Keep the dev server on loopback and use the built frontend for hosting. |
| [Blockchain](audit/blockchain.json) | 11 | 4 | 9 | 0 | Removed unused toolbox components and applied compatible fixes. Remaining findings are in Hardhat 2 and its test/compile dependencies. Do not expose the development node; review a Hardhat 3 migration separately. |

Counts are npm advisory entries (including dependency propagation), measured at scan time. The Hardhat and Vite upgrade paths reported by npm include breaking toolchain changes. No private credentials were added to tracked examples or public config. The Antigravity export includes credentials shared previously; rotate the affected Pinata key and Atlas password and avoid distributing that export. The backend accepts a separate Sepolia environment profile so the public test signer is not used by the local demo.

## Complete the Sepolia comparison

Follow [Sepolia setup](../README.md#sepolia-setup). Keep both runs on the same contract build and use fresh deployments for matching first-anchor effects. Save the public deployment receipt and the five per-anchor receipts, then review the automatically regenerated comparison. Compare gas units separately from fee and confirmation time. Test ETH is a network test token; no fiat estimate is provided. Public figures remain **pending** until measured.
