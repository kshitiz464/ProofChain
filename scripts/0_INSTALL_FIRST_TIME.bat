@echo off
setlocal
title ProofChain First Time Setup
set "ROOT=%~dp0.."
set "HARDHAT_DISABLE_TELEMETRY_PROMPT=true"
where node >nul 2>&1
if not errorlevel 1 goto check_node
where winget >nul 2>&1
if errorlevel 1 goto node_missing
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto node_missing
set "PATH=%ProgramFiles%\nodejs;%PATH%"
:check_node
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<20 || (a===20 && b<15)) process.exit(1)"
if errorlevel 1 goto node_missing
for %%D in (blockchain backend frontend) do (
    pushd "%ROOT%\%%D"
    call npm ci
    if errorlevel 1 goto failed
    popd
)
pushd "%ROOT%\blockchain"
call npm run compile
if errorlevel 1 goto failed
popd
if not exist "%ROOT%\backend\.env" copy "%ROOT%\backend\.env.example" "%ROOT%\backend\.env" >nul
echo Setup complete. Add your Pinata JWT and optional MongoDB URI in backend\.env.
echo Then run 1_START_ALL.bat.
pause
exit /b 0
:node_missing
echo Install or update Node.js LTS from https://nodejs.org/ and run this script again.
pause
exit /b 1
:failed
echo Setup failed. Review the npm or Hardhat error above.
pause
exit /b 1

