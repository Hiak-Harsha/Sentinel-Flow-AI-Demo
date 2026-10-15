@echo off
title Sentinel Flow - Launcher
echo ========================================================
echo   Sentinel Flow v2.0 - AI Intrusion Detection System
echo   GITAM University - AI Applications Class Demonstration
echo ========================================================

echo.
echo [1/4] Checking System Prerequisites...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH.
    pause
    exit /b 1
)
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js/npm is not installed or not in PATH.
    pause
    exit /b 1
)
echo   Prerequisites verified: Python and Node/npm found.

echo.
echo [2/4] Verifying Calibrated Machine Learning Artifacts...
if not exist "backend\artifacts\production_model.joblib" (
    echo   Model artifact missing. Synthesizing lab dataset and training model...
    python scripts\collect_lab_dataset.py
    python backend\train_model.py
    echo   Model training and probability calibration complete.
) else (
    echo   Model artifact verified: backend\artifacts\production_model.joblib
)

echo.
echo [3/4] Starting Backend API (FastAPI on http://localhost:8000)...
start "Sentinel Flow Backend" cmd /k "python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000"

timeout /t 3 /nobreak >nul

echo.
echo [4/4] Starting Frontend Dashboard (Vite on http://localhost:5173)...
start "Sentinel Flow Frontend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
echo.
echo Opening Sentinel Flow in default browser: http://localhost:5173...
start http://localhost:5173

echo.
echo ========================================================
echo   Sentinel Flow is live and monitoring traffic!
echo   - UI Dashboard: http://localhost:5173
echo   - API Docs:     http://localhost:8000/docs
echo   - Metrics:      http://localhost:8000/metrics
echo   Close the opened terminal windows to stop servers.
echo ========================================================
