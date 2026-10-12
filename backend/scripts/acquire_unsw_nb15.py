"""Validate and stage manually downloaded UNSW-NB15 CSV split files.

The official UNSW download route may require an academic/manual download. This
script intentionally does not guess at a third-party URL or fetch data when the
application starts. It copies files the presenter has obtained legitimately and
checks that the expected schema is present before training.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import pandas as pd

from app.feature_schema import DATASET_URL, FLOW_FEATURES


NAMES = {
    "training": ["UNSW_NB15_training-set.csv", "UNSW-NB15_training-set.csv"],
    "testing": ["UNSW_NB15_testing-set.csv", "UNSW-NB15_testing-set.csv"],
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_source(source_dir: Path, kind: str) -> Path:
    for name in NAMES[kind]:
        candidate = source_dir / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Could not find {kind} split under {source_dir}")


def validate(path: Path) -> dict[str, int]:
    preview = pd.read_csv(path, nrows=10)
    expected = set(FLOW_FEATURES + ["label"])
    missing = sorted(expected - set(preview.columns))
    if missing:
        raise ValueError(f"{path.name} lacks expected UNSW-NB15 columns: {missing}")
    return {"columns": len(preview.columns), "preview_rows": len(preview)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", help="Folder containing the manual official CSV download")
    parser.add_argument(
        "--source-url", default=DATASET_URL, help="Source URL recorded in the provenance receipt"
    )
    args = parser.parse_args()
    source_dir = Path(args.source_dir).expanduser().resolve()
    destination = Path(__file__).resolve().parents[1] / "data" / "raw"
    destination.mkdir(parents=True, exist_ok=True)

    receipt: dict[str, object] = {"source_url": args.source_url, "files": {}}
    for kind, destination_name in [("training", NAMES["training"][0]), ("testing", NAMES["testing"][0])]:
        source = find_source(source_dir, kind)
        validation = validate(source)
        target = destination / destination_name
        shutil.copy2(source, target)
        receipt["files"][kind] = {
            "filename": target.name,
            "sha256": sha256_file(target),
            **validation,
        }
        print(f"Staged {kind}: {target}")

    (destination / "provenance.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(f"Wrote provenance receipt: {destination / 'provenance.json'}")


if __name__ == "__main__":
    main()
