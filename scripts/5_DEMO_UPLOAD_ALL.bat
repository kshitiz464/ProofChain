@echo off
title ProofChain — Demo: Auto Upload All 5 Documents

color 0A
cls
echo.
echo  ============================================================
echo   📤  ProofChain — Auto Upload Demo Documents
echo   Uploads all 5 demo documents to ProofChain API
echo  ============================================================
echo.
echo  Prerequisites:
echo    ✓ ProofChain backend running at http://localhost:5000
echo    ✓ Hardhat node running at http://127.0.0.1:8545
echo    ✓ Contract deployed
echo.
echo  Press any key to start uploading...
pause >nul

set "DOCS=%~dp0..\demo-documents"
set "API=http://localhost:5000/api/upload"

echo.
echo  ────────────────────────────────────────────────────────────

:: Upload Document 1
echo  [1/5] Uploading: 01_Research_Paper_Abstract.txt
curl -s -X POST "%API%" ^
  -F "document=@%DOCS%\01_Research_Paper_Abstract.txt" ^
  | python -c "import sys,json; d=json.load(sys.stdin); print('  CID:', d['data']['cid'][:40]+'...') if d.get('success') else print('  Error:', d.get('error','unknown'))" 2>nul
if errorlevel 1 (
  echo  [Note] curl or python not available — check result in browser
)
echo.

:: Upload Document 2
echo  [2/5] Uploading: 02_IP_Registration_Notice.txt
curl -s -X POST "%API%" ^
  -F "document=@%DOCS%\02_IP_Registration_Notice.txt" ^
  | python -c "import sys,json; d=json.load(sys.stdin); print('  CID:', d['data']['cid'][:40]+'...') if d.get('success') else print('  Error:', d.get('error','unknown'))" 2>nul
echo.

:: Upload Document 3
echo  [3/5] Uploading: 03_Software_License_Agreement.txt
curl -s -X POST "%API%" ^
  -F "document=@%DOCS%\03_Software_License_Agreement.txt" ^
  | python -c "import sys,json; d=json.load(sys.stdin); print('  CID:', d['data']['cid'][:40]+'...') if d.get('success') else print('  Error:', d.get('error','unknown'))" 2>nul
echo.

:: Upload Document 4
echo  [4/5] Uploading: 04_Project_Completion_Certificate.txt
curl -s -X POST "%API%" ^
  -F "document=@%DOCS%\04_Project_Completion_Certificate.txt" ^
  | python -c "import sys,json; d=json.load(sys.stdin); print('  CID:', d['data']['cid'][:40]+'...') if d.get('success') else print('  Error:', d.get('error','unknown'))" 2>nul
echo.

:: Upload Document 5
echo  [5/5] Uploading: 05_Plagiarism_Free_Declaration.txt
curl -s -X POST "%API%" ^
  -F "document=@%DOCS%\05_Plagiarism_Free_Declaration.txt" ^
  | python -c "import sys,json; d=json.load(sys.stdin); print('  CID:', d['data']['cid'][:40]+'...') if d.get('success') else print('  Error:', d.get('error','unknown'))" 2>nul
echo.

echo  ────────────────────────────────────────────────────────────
echo.
echo  ✅  All 5 documents submitted to ProofChain!
echo.
echo  Now open the browser to see them in the History tab:
start http://localhost:5173
echo.
echo  (Page opened automatically)
echo.
pause
