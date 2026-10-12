# UNSW-NB15 data

This application is designed for the public, academic-use **UNSW-NB15** intrusion-detection dataset. It trains on eight flow features that can be transparently represented by the local demo's application-flow telemetry:

`dur`, `spkts`, `dpkts`, `sbytes`, `dbytes`, `rate`, `sload`, `dload`

Download the official training and testing CSV files from the [UNSW-NB15 dataset page](https://research.unsw.edu.au/projects/unsw-nb15-dataset), place them in `backend/data/raw/`, then run:

```powershell
python backend/train_model.py
```

The raw CSV files are intentionally ignored by Git. They are research data, not application source code. `train_model.py` records source and SHA-256 provenance beside the generated model artifacts.

The class demo must only use the application's own local/controlled endpoint. It does not capture university traffic, store packet bodies, or target third-party services.
