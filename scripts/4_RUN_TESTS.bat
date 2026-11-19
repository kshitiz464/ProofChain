@echo off
setlocal
title ProofChain Tests
set "HARDHAT_DISABLE_TELEMETRY_PROMPT=true"
pushd "%~dp0..\blockchain"
call npm test
if errorlevel 1 goto failed
popd
pushd "%~dp0..\backend"
call npm test
if errorlevel 1 goto failed
popd
pushd "%~dp0..\frontend"
call npm run build
if errorlevel 1 goto failed
popd
echo Contract tests, API tests and frontend build passed.
pause
exit /b 0
:failed
popd
echo A check failed. See the output above.
pause
exit /b 1

