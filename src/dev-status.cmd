@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-status.ps1" %*
