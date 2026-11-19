# ProofChain Windows demo manual

For the first run, double-click [0_INSTALL_FIRST_TIME.bat](scripts/0_INSTALL_FIRST_TIME.bat). Configure the Pinata JWT and optional MongoDB URI in `backend/.env`. Keep the keys and the historical Antigravity export private. The export contains previously shared credentials; rotate those credentials at Pinata and Atlas before sharing the workspace.

| Script | What it does |
|---|---|
| [1_START_ALL.bat](scripts/1_START_ALL.bat) | Starts and checks the local blockchain, contract, API and frontend, then opens the app. If the stack is already healthy, it opens the existing session. |
| [2_QUICK_RESTART.bat](scripts/2_QUICK_RESTART.bat) | Restarts the local demo with a fresh ledger. Previous local anchors are no longer verifiable after a reset. |
| [3_STOP_ALL.bat](scripts/3_STOP_ALL.bat) | Stops the local demo services started by the launcher. |
| [4_RUN_TESTS.bat](scripts/4_RUN_TESTS.bat) | Runs contract and API tests and builds the frontend. |
| [5_DEMO_UPLOAD_ALL.bat](scripts/5_DEMO_UPLOAD_ALL.bat) | Sends the first five sample documents to the running API. They are published to IPFS, so use only the supplied demo files. |
| [6_DEPLOY_SEPOLIA.bat](scripts/6_DEPLOY_SEPOLIA.bat) | Deploys to Sepolia using `blockchain/.env`. Requires a funded test wallet. |
| [7_START_SEPOLIA_API.bat](scripts/7_START_SEPOLIA_API.bat) | Runs the API using the separate Sepolia profile. Stop any API already listening on port 5000 first. |
| [8_BENCHMARK_SEPOLIA.bat](scripts/8_BENCHMARK_SEPOLIA.bat) | Runs the comparison on the public testnet and updates the gas report. Consumes test ETH. |

For the viva, start with one [sample document](demo-documents), then show the CID and gas fields after confirmation. In History, filter by the same filename and open the preview and IPFS download. Verify the original, then change a byte in a copy and verify that it has no anchor. Finally, show the [receipt measurements](reports/GAS_RESULTS.md). The graphical certificates are HTML samples; their embedded preview runs in a sandbox.

| Symptom | What to check |
|---|---|
| Frontend cannot reach the API | Check the service logs in `backend/data/local-startup` and the [health endpoint](http://127.0.0.1:5000/api/health). |
| Blockchain missing or wrong network | Deploy to the intended chain and restart the backend with the correct profile. |
| History says MongoDB is unavailable | Check Atlas credentials, DB permissions, and the current IP allow rule. Confirmed local entries are queued in `backend/data/outbox`. Preserve this directory. |
| Pinata timeout or rejected request | Check the JWT's scope and network. Retry after a storage timeout. |
| Confirmation pending | Copy the CID and transaction hash. Verify by CID or check the explorer before retrying. The API reconciles recorded pending receipts. |
| Rate limited | Wait for the retry window to expire. |
| Preview/download unavailable | Try Open on IPFS. Gateway availability, file format and browser policies can affect preview and download. |

See the [README](README.md) for manual commands and Sepolia funding/setup.

