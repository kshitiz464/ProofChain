@echo off
setlocal
title ProofChain Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-services.ps1" -Action Start
set "RESULT=%ERRORLEVEL%"
if not "%PROOFCHAIN_NO_BROWSER%"=="1" pause
exit /b %RESULT%
