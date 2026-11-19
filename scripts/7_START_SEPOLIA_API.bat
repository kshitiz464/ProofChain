@echo off
setlocal
title ProofChain Sepolia API
cd /d "%~dp0..\backend"
if not exist ".env.sepolia" (
    echo Run 6_DEPLOY_SEPOLIA.bat to create the Sepolia profile first.
    pause
    exit /b 1
)
set "ENV_FILE=.env.sepolia"
call npm start
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%

