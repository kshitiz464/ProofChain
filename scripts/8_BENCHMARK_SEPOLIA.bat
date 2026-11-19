@echo off
setlocal
title ProofChain Sepolia Gas Benchmark
cd /d "%~dp0..\blockchain"
set "HARDHAT_DISABLE_TELEMETRY_PROMPT=true"
echo Run the local benchmark and public Sepolia benchmark.
echo The public benchmark sends transactions and spends Sepolia test ETH.
echo Close this window to cancel.
pause
call npm run benchmark:local
if errorlevel 1 goto failed
call npm run benchmark:sepolia
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%
:failed
echo Local benchmark failed; public benchmark skipped.
pause
exit /b 1

