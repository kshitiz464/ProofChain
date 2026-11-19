@echo off
setlocal
title ProofChain Sepolia Deployment
cd /d "%~dp0..\blockchain"
echo Deploy ProofChain to Sepolia using the wallet in blockchain\.env.
echo This spends Sepolia test ETH. Close this window to cancel.
pause
call npm run deploy:sepolia
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%

