# Sentinel Flow - AI-Based Network Intrusion & Anomaly Detection

Sentinel Flow is a focused, safe class demonstration for GITAM's *AI Applications in Various Domains* assignment. It demonstrates the complete story:

> **Problem -> AI Technique -> Working -> Result -> Impact**

The application is deliberately small enough to explain in a 15-minute class demonstration, while keeping the important parts real:

- a persisted scikit-learn Random Forest model trained and evaluated against the genuine UNSW-NB15 dataset;
- a FastAPI service with WebSocket updates and SQLite-backed replay events;
- a React + Vite + Tailwind dashboard;
- a controlled, owned-server application-flow simulation, not a network attack or a campus traffic sniffer;
- live prediction confidence, actual held-out evaluation metrics, a confusion matrix, and a transparent "why was this flagged?" explanation.

## Safety boundary

This is a **defensive classroom prototype**. It only models bounded, local application-flow telemetry sent to the demo server. Do not point it at university systems, other people's devices, or third-party services. It does not perform packet capture, port scanning, flooding, or exploit attempts.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Python, FastAPI, WebSockets
- ML: Pandas, NumPy, scikit-learn, Joblib
- Storage: SQLite
- Dataset: [UNSW-NB15](https://research.unsw.edu.au/projects/unsw-nb15-dataset)

## Quick start

1. Install frontend packages:

   ```powershell
   npm install
   ```

2. Create a Python environment and install backend packages:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r backend\requirements.txt
   ```

3. Download the official UNSW-NB15 training and testing CSV files into `backend/data/raw/`, then train the genuine model:

   ```powershell
   python backend\train_model.py
   ```

4. Run the backend:

   ```powershell
   uvicorn app.main:app --app-dir backend --reload --port 8000
   ```

5. In another terminal, run the frontend:

   ```powershell
   npm run dev
   ```

Open `http://localhost:5173`.

## What the vertical slice demonstrates

1. **Objective screen:** Normal -> controlled abnormal flow -> AI analysis -> alert.
2. **Controlled session:** Team members join with a display alias; only aliases and aggregate event metadata are retained.
3. **Normal baseline:** The persisted model receives a genuine held-out benign UNSW-NB15 flow.
4. **Controlled abnormal event:** The persisted model receives a genuine held-out suspicious UNSW-NB15 flow represented as safe local application-flow telemetry.
5. **Live outcome:** FastAPI broadcasts the event over WebSockets; every dashboard sees the prediction, probability, influential feature deviations, metrics, and replay timeline.

## Why UNSW-NB15?

UNSW-NB15 publishes distinct training (175,341) and testing (82,332) CSV partitions and contains packet/byte/rate flow fields that map coherently to an application-flow demonstration. It contains nine attack categories and 49 derived features. The prototype intentionally uses only eight explainable numeric flow features, not every available column.

## Presentation content included in the app

The dashboard includes actual results, a case study (Amazon GuardDuty), limitations, sources, and a replay. Keep the spoken explanation focused on the assignment's seven required areas instead of treating the dashboard as an enterprise SOC product.

## Sources

- Moustafa, N., & Slay, J. (2015). *UNSW-NB15: A comprehensive data set for network intrusion detection systems.* [Dataset and citation guidance](https://research.unsw.edu.au/projects/unsw-nb15-dataset)
- [Amazon GuardDuty documentation](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) - an example of a production monitoring service that combines threat intelligence and ML to find suspicious activity.
- GITAM University, *AI Applications - Class Demonstration* assignment brief (provided by the course).
