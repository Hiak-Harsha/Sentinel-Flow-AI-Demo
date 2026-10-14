"""Sentinel Flow ML Model Training & Verification Entrypoint.

Delegates to scripts/train_model.py to benchmark classifiers on live observable features,
calibrate prediction probabilities, evaluate confidence intervals, and generate docs/MODEL_CARD.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from train_model import main

if __name__ == "__main__":
    main()
