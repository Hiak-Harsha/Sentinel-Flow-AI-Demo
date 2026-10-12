# Sentinel Flow - One-Click PowerShell Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Sentinel Flow - AI Intrusion Detection Demo" -ForegroundColor Cyan
Write-Host "  GITAM University - AI Applications" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Model verification
if (-not (Test-Path "backend\artifacts\rf_unsw_nb15.joblib")) {
    Write-Host "[1/3] Model artifact not found. Training model now..." -ForegroundColor Yellow
    python backend\train_model.py
} else {
    Write-Host "[1/3] Model artifact verified: backend\artifacts\rf_unsw_nb15.joblib" -ForegroundColor Green
}

# 2. Launch Backend
Write-Host "[2/3] Starting Backend API (FastAPI on http://localhost:8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn app.main:app --app-dir backend --port 8000"

Start-Sleep -Seconds 2

# 3. Launch Frontend
Write-Host "[3/3] Starting Frontend (Vite on http://localhost:5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"

Start-Sleep -Seconds 3

Write-Host "Opening http://localhost:5173 in browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "Demo is running! Close the opened PowerShell windows to stop." -ForegroundColor Magenta
