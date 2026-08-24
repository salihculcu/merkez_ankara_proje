@echo off
cd /d "%~dp0"
"%LOCALAPPDATA%\Programs\Python\Python314\python.exe" -u server.py
if errorlevel 1 pause
