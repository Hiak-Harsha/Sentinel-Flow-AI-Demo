@echo off
title Sentinel Flow - Launcher
echo ========================================================
echo   Sentinel Flow - AI Intrusion Detection Demo
echo   GITAM University - AI Applications
echo ========================================================
echo [1/3] Checking Model Artifacts...
if not exist "backend\artifacts\rf_unsw_nb15.joblib" (
    echo Model artifact not found! Training model now...
    python backend\train_model.py
) else (
    echo Model artifact verified: backend\artifacts\rf_unsw_nb15.joblib
)

echo.
echo [2/3] Starting Backend API (FastAPI on http://localhost:8000)...
start "Sentinel Flow Backend" cmd /k "python -m uvicorn app.main:app --app-dir backend --port 8000"

timeout /t 2 /nobreak >nul

echo.
echo [3/3] Starting Frontend Dashboard (Vite on http://localhost:5173)...
start "Sentinel Flow Frontend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
echo.
echo Opening Sentinel Flow in default browser...
start http://localhost:5173
echo.
echo Demo is running! Close the opened terminal windows to stop.
