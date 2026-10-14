"""Generate TypeScript definitions from FastAPI OpenAPI specification.

Supports --check flag for CI to verify that schema.d.ts is up to date.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
OPENAPI_JSON = REPO_ROOT / "openapi.json"
TARGET_SCHEMA = REPO_ROOT / "src" / "api" / "schema.d.ts"


def generate_openapi_json() -> dict:
    sys.path.insert(0, str(BACKEND_DIR))
    from app.main import app

    spec = app.openapi()
    return spec


def main():
    parser = argparse.ArgumentParser(description="Generate TypeScript types from FastAPI OpenAPI spec.")
    parser.add_argument("--check", action="store_true", help="Fail if generated types differ from src/api/schema.d.ts")
    args = parser.parse_args()

    spec = generate_openapi_json()
    with open(OPENAPI_JSON, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)

    TARGET_SCHEMA.parent.mkdir(parents=True, exist_ok=True)

    if args.check:
        with tempfile.NamedTemporaryFile(suffix=".d.ts", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            cmd = ["npx", "--yes", "openapi-typescript", str(OPENAPI_JSON), "-o", str(tmp_path)]
            subprocess.run(cmd, check=True, shell=(sys.platform == "win32"), cwd=str(REPO_ROOT))

            current_content = TARGET_SCHEMA.read_text(encoding="utf-8").replace("\r\n", "\n") if TARGET_SCHEMA.exists() else ""
            new_content = tmp_path.read_text(encoding="utf-8").replace("\r\n", "\n")

            if current_content != new_content:
                print("ERROR: src/api/schema.d.ts is out of date. Run 'make api-types' to refresh.", file=sys.stderr)
                sys.exit(1)
            else:
                print("OK: src/api/schema.d.ts is up to date.")
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
    else:
        cmd = ["npx", "--yes", "openapi-typescript", str(OPENAPI_JSON), "-o", str(TARGET_SCHEMA)]
        subprocess.run(cmd, check=True, shell=(sys.platform == "win32"), cwd=str(REPO_ROOT))
        print(f"Generated {TARGET_SCHEMA.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
