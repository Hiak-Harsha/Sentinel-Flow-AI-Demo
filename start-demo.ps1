# Sentinel Flow - One-Click PowerShell Launcher
# Production-Grade Defensive Security Monitoring & Threat Detection

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Sentinel Flow v2.0 - AI Intrusion Detection System" -ForegroundColor Cyan
Write-Host "  GITAM University - AI Applications Class Demonstration" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Environment & Dependency Checks
Write-Host "`n[1/4] Verifying System Prerequisites..." -ForegroundColor Cyan
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js/npm is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
Write-Host "  Prerequisites verified: Python and Node/npm are present." -ForegroundColor Green

# 2. Model Verification & Training
Write-Host "`n[2/4] Verifying Calibrated Machine Learning Artifacts..." -ForegroundColor Cyan
if (-not (Test-Path "backend\artifacts\production_model.joblib")) {
    Write-Host "  Model artifact missing. Synthesizing lab dataset and training model..." -ForegroundColor Yellow
    python scripts\collect_lab_dataset.py
    python backend\train_model.py
    Write-Host "  Model training and probability calibration complete." -ForegroundColor Green
} else {
    Write-Host "  Model artifact verified: backend\artifacts\production_model.joblib" -ForegroundColor Green
}

# 3. Launch Backend API
Write-Host "`n[3/4] Starting Backend API (FastAPI + WebSockets on http://localhost:8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Sentinel Flow Backend'; python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000"

Start-Sleep -Seconds 3

# 4. Launch Frontend Dev Server
Write-Host "`n[4/4] Starting Frontend Dashboard (Vite on http://localhost:5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Sentinel Flow Frontend'; npm run dev"

Start-Sleep -Seconds 3

Write-Host "`nOpening Sentinel Flow in browser: http://localhost:5173..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "  Sentinel Flow is live and monitoring traffic!" -ForegroundColor Magenta
Write-Host "  - UI Dashboard: http://localhost:5173" -ForegroundColor Magenta
Write-Host "  - API Docs:     http://localhost:8000/docs" -ForegroundColor Magenta
Write-Host "  - Metrics:      http://localhost:8000/metrics" -ForegroundColor Magenta
Write-Host "  Close the spawned PowerShell windows to stop servers." -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta
