@echo off
cd /d %~dp0backend

rem --- Read PORT from backend\.env (defaults to 5000) ---
set "BACKEND_PORT=5000"
if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
        if /i "%%A"=="PORT" set "BACKEND_PORT=%%B"
    )
)

rem --- Free the port if a previous dev server is still holding it ---
echo Checking port %BACKEND_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%BACKEND_PORT% .*LISTENING"') do (
    echo   Port %BACKEND_PORT% is held by PID %%P - stopping stale process...
    taskkill /PID %%P /T /F >nul 2>&1
)

npm run dev
pause
