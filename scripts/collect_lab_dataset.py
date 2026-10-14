"""Collect and synthesize versioned, self-labeled lab datasets for ML training and evaluation.

This script executes or synthesizes deterministic, ground-truth labeled scenarios:
- Benign browsing, asset bursts, and API polling (label 0)
- Credential stuffing / brute force (label 1)
- Endpoint vulnerability scanning (label 1)
- Data exfiltration volume spikes (label 1)
- Low-and-slow stealth probing (label 1)

Every feature window is processed through the genuine FeaturePipeline (schema v2.0.0),
ensuring zero train/serve skew and total fidelity with runtime observable features.
Output is saved to backend/data/processed/lab_features.parquet (and .jsonl).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Ensure backend package is importable
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pandas as pd

from app.feature_schema import FEATURE_SCHEMA_VERSION, LIVE_FEATURE_NAMES, extract_live_feature_vector
from app.pipeline.feature_pipeline import FeaturePipeline
from app.pipeline.feature_store import FeatureStore, IdentityFeatureVector
from app.proxy.traffic_logger import TrafficLogger


def get_git_revision() -> str:
    """Attempt to retrieve current git commit hash."""
    try:
        import subprocess
        out = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL)
        return out.decode().strip()
    except Exception:
        return "unknown"


class LabDatasetCollector:
    """Generates ground-truth labeled scenario runs and extracts sliding-window feature vectors."""

    def __init__(self, seed: int = 42) -> None:
        self.seed = seed
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)

    def _generate_benign_browsing(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 60.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        endpoints = [
            "/", "/catalog", "/catalog/item/101", "/catalog/item/102",
            "/about", "/contact", "/api/v1/health/live", "/docs"
        ]
        methods = ["GET", "GET", "GET", "GET", "GET", "POST"]

        while curr < start_time + duration_s:
            # Human think-time: 1.0 to 3.5 seconds
            think_time = self.rng.uniform(0.8, 3.2)
            curr += think_time
            if curr >= start_time + duration_s:
                break

            path = self.rng.choice(endpoints)
            method = "POST" if path.startswith("/catalog") and self.rng.random() < 0.2 else "GET"
            # 97% 200 OK, 3% 404 Not Found
            status = 200 if self.rng.random() > 0.03 else 404
            req_size = self.rng.randint(80, 350)
            resp_size = self.rng.randint(400, 3200) if status == 200 else 120
            latency = self.rng.uniform(12.0, 48.0)

            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": method,
                "path": path,
                "status_code": status,
                "request_size_bytes": req_size,
                "response_size_bytes": resp_size,
                "latency_ms": latency,
            })
        return events

    def _generate_benign_asset_burst(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 60.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        assets = [
            "/static/css/main.css", "/static/js/bundle.js", "/static/img/hero.webp",
            "/static/fonts/inter.woff2", "/static/favicon.ico", "/static/icons.svg",
            "/static/logo.svg", "/static/vendor.js"
        ]

        while curr < start_time + duration_s:
            # User navigates to a new page
            curr += self.rng.uniform(3.0, 8.0)
            if curr >= start_time + duration_s:
                break

            # Initial page GET
            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": "GET",
                "path": f"/dashboard/view/{self.rng.randint(1, 10)}",
                "status_code": 200,
                "request_size_bytes": 150,
                "response_size_bytes": 4500,
                "latency_ms": 35.0,
            })

            # Rapid parallel asset load (burst of 6-12 requests with small ms offsets)
            burst_size = self.rng.randint(6, 12)
            for _ in range(burst_size):
                curr += self.rng.uniform(0.015, 0.08)
                events.append({
                    "identity_id": identity_id,
                    "timestamp": curr,
                    "method": "GET",
                    "path": self.rng.choice(assets),
                    "status_code": 200 if self.rng.random() > 0.02 else 304,
                    "request_size_bytes": self.rng.randint(60, 180),
                    "response_size_bytes": self.rng.randint(1200, 18000),
                    "latency_ms": self.rng.uniform(8.0, 25.0),
                })
        return events

    def _generate_credential_stuffing(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 45.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        target_path = "/api/v1/auth/login"

        # Rapid repetitive login requests
        while curr < start_time + duration_s:
            # High rate: 8 - 20 req/s -> 50ms - 120ms between requests
            curr += self.rng.uniform(0.05, 0.14)
            if curr >= start_time + duration_s:
                break

            # 92% 401 Unauthorized, 8% 403 Forbidden
            status = 401 if self.rng.random() > 0.08 else 403
            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": "POST",
                "path": target_path,
                "status_code": status,
                "request_size_bytes": self.rng.randint(180, 260),
                "response_size_bytes": 145,
                "latency_ms": self.rng.uniform(15.0, 45.0),
            })
        return events

    def _generate_endpoint_scan(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 45.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        scan_paths = [
            "/.env", "/.git/config", "/admin", "/admin/login", "/phpmyadmin",
            "/api/v1/debug", "/actuator/health", "/wp-login.php", "/config.json",
            "/server-status", "/setup.php", "/console", "/manager/html",
            "/api/internal/dump", "/v2/_catalog", "/api/v1/metrics", "/root"
        ]

        while curr < start_time + duration_s:
            # Scan rate: 10 - 25 req/s -> 40ms - 100ms
            curr += self.rng.uniform(0.04, 0.11)
            if curr >= start_time + duration_s:
                break

            path = self.rng.choice(scan_paths)
            status = 404 if self.rng.random() > 0.05 else 403
            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": "GET",
                "path": path,
                "status_code": status,
                "request_size_bytes": self.rng.randint(70, 160),
                "response_size_bytes": 190,
                "latency_ms": self.rng.uniform(8.0, 30.0),
            })
        return events

    def _generate_data_exfiltration(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 45.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        exfil_paths = ["/api/v1/export/records", "/lab-target/export", "/api/v1/database/dump"]

        while curr < start_time + duration_s:
            curr += self.rng.uniform(0.4, 1.2)
            if curr >= start_time + duration_s:
                break

            path = self.rng.choice(exfil_paths)
            # Massive outbound bytes (50 KB - 600 KB)
            out_bytes = self.rng.randint(50000, 600000)
            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": "POST" if self.rng.random() < 0.3 else "GET",
                "path": path,
                "status_code": 200,
                "request_size_bytes": self.rng.randint(200, 1200),
                "response_size_bytes": out_bytes,
                "latency_ms": self.rng.uniform(80.0, 350.0),
            })
        return events

    def _generate_low_and_slow(self, run_id: str, identity_id: str, start_time: float, duration_s: float = 90.0) -> list[dict[str, Any]]:
        events = []
        curr = start_time
        targets = ["/api/v1/auth/login", "/api/v1/users/lookup", "/canary/token"]

        while curr < start_time + duration_s:
            # Stealthy delay: 3.5 to 8.0 seconds between probes
            curr += self.rng.uniform(3.5, 8.0)
            if curr >= start_time + duration_s:
                break

            path = self.rng.choice(targets)
            status = 401 if "auth" in path else (404 if "canary" in path else 200)
            events.append({
                "identity_id": identity_id,
                "timestamp": curr,
                "method": "POST" if "auth" in path else "GET",
                "path": path,
                "status_code": status,
                "request_size_bytes": self.rng.randint(120, 280),
                "response_size_bytes": self.rng.randint(150, 400),
                "latency_ms": self.rng.uniform(40.0, 95.0),
            })
        return events

    def collect(self, num_runs: int = 16) -> pd.DataFrame:
        """Run scenario generators, pipe events through FeaturePipeline, and return labeled dataframe."""
        records: list[dict[str, Any]] = []

        scenario_configs = [
            ("benign_browsing", 0, self._generate_benign_browsing, 60.0),
            ("benign_asset_burst", 0, self._generate_benign_asset_burst, 60.0),
            ("credential_stuffing", 1, self._generate_credential_stuffing, 45.0),
            ("endpoint_scan", 1, self._generate_endpoint_scan, 45.0),
            ("data_exfiltration", 1, self._generate_data_exfiltration, 45.0),
            ("low_and_slow", 1, self._generate_low_and_slow, 80.0),
        ]

        run_counter = 0
        base_epoch = 1770000000.0  # Stable deterministic simulation epoch

        for cycle in range(math.ceil(num_runs / len(scenario_configs))):
            for scenario_name, is_attack, generator_fn, duration_s in scenario_configs:
                run_counter += 1
                if run_counter > num_runs:
                    break

                run_id = f"run_{run_counter:03d}_{scenario_name}"
                actor_id = f"actor_{scenario_name}_{run_counter}"
                run_start = base_epoch + (run_counter * 3600.0)

                # Generate scenario raw traffic events
                events = generator_fn(run_id=run_id, identity_id=actor_id, start_time=run_start, duration_s=duration_s)
                events.sort(key=lambda x: x["timestamp"])

                # Feed events into FeaturePipeline
                logger = TrafficLogger()
                store = FeatureStore(max_history=500)
                pipeline = FeaturePipeline(traffic_logger=logger, feature_store=store)

                # Process events in sequence
                event_idx = 0
                total_events = len(events)
                if not events:
                    continue

                min_t = events[0]["timestamp"]
                max_t = events[-1]["timestamp"]

                # Sample feature vectors every 1.5 seconds across the run
                sample_t = min_t + 5.0  # Allow 5s initial window warmup
                while sample_t <= max_t + 1.0:
                    # Feed any events that arrived up to sample_t
                    while event_idx < total_events and events[event_idx]["timestamp"] <= sample_t:
                        ev = events[event_idx]
                        logger.log(
                            identity_id=ev["identity_id"],
                            method=ev["method"],
                            path=ev["path"],
                            status_code=ev["status_code"],
                            request_size_bytes=ev["request_size_bytes"],
                            response_size_bytes=ev["response_size_bytes"],
                            latency_ms=ev["latency_ms"],
                            timestamp_epoch=ev["timestamp"],
                            target_origin="http://localhost:8000",
                        )
                        event_idx += 1

                    # Compute streaming features at sample_t
                    vec: IdentityFeatureVector = pipeline.compute_features_for_identity(actor_id, now=sample_t)
                    vec_dict = vec.to_dict()

                    # Extract numerical live feature mapping
                    features = extract_live_feature_vector(vec_dict)
                    row = {
                        "run_id": run_id,
                        "scenario_name": scenario_name,
                        "identity_id": actor_id,
                        "is_attack": is_attack,
                        "timestamp_epoch": sample_t,
                        "feature_schema_version": FEATURE_SCHEMA_VERSION,
                        **features,
                    }
                    records.append(row)
                    sample_t += 1.5

        df = pd.DataFrame(records)
        return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--num-runs", type=int, default=24, help="Total scenario runs to synthesize")
    parser.add_argument("--output-dir", default=str(BACKEND_DIR / "data" / "processed"), help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed")
    parser.add_argument("--quiet", action="store_true", help="Quiet output")
    args = parser.parse_args()

    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    collector = LabDatasetCollector(seed=args.seed)
    df = collector.collect(num_runs=args.num_runs)

    parquet_path = out_dir / "lab_features.parquet"
    jsonl_path = out_dir / "lab_features.jsonl"
    manifest_path = out_dir / "lab_manifest.json"

    # Save to Parquet
    df.to_parquet(parquet_path, index=False)

    # Save to JSONL fallback
    df.to_json(jsonl_path, orient="records", lines=True)

    # Compute manifest
    counts = df["is_attack"].value_counts().to_dict()
    scenario_counts = df["scenario_name"].value_counts().to_dict()
    runs = df["run_id"].nunique()

    manifest = {
        "dataset_name": "Sentinel-Live-Lab-Dataset",
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "seed": args.seed,
        "git_commit": get_git_revision(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "total_windows": len(df),
        "total_runs": int(runs),
        "benign_windows": int(counts.get(0, 0)),
        "attack_windows": int(counts.get(1, 0)),
        "scenario_distribution": {k: int(v) for k, v in scenario_counts.items()},
        "feature_names": LIVE_FEATURE_NAMES,
        "artifacts": {
            "parquet": str(parquet_path.relative_to(BACKEND_DIR)),
            "jsonl": str(jsonl_path.relative_to(BACKEND_DIR)),
        },
    }

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    if not args.quiet:
        print(f"Collected {len(df)} live feature windows across {runs} runs.")
        print(f"Benign windows: {counts.get(0, 0)} | Attack windows: {counts.get(1, 0)}")
        print(f"Saved Parquet: {parquet_path}")
        print(f"Saved JSONL: {jsonl_path}")
        print(f"Saved Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
