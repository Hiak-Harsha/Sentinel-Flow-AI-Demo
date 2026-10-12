"""Package Sentinel Flow AI Demo into a clean zip archive."""

import os
import shutil
import zipfile
from pathlib import Path

src_dir = Path(r"c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo").resolve()
desktop_zip = Path(r"C:\Users\madha\Desktop\sentinel-flow-ai-demo.zip")
workspace_zip = src_dir / "sentinel-flow-ai-demo.zip"
outputs_zip = src_dir / "outputs" / "sentinel-flow-ai-demo.zip"
codex_dir = Path(r"c:\Users\madha\Documents\Codex\2026-10-01\referenced-chatgpt-conversation-this-is-an")

EXCLUDE_DIRS = {
    "node_modules",
    ".npm-cache",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".git",
    ".system_generated",
    ".tempmediaStorage",
    "outputs",
    "work",
    "scratch",
    ".gemini",
    ".vscode",
}

EXCLUDE_EXTS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".DS_Store",
    ".zip",
}

EXCLUDE_FILES = {
    "sentinel_flow.db",
    "package_zip.py",
}

print(f"Packaging files from {src_dir}...")

temp_zip = src_dir / "sentinel-flow-ai-demo.tmp.zip"
total_files = 0

with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zipf:
    for root, dirs, files in os.walk(src_dir):
        # Exclude directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]
        for f in sorted(files):
            if f in EXCLUDE_FILES or any(f.endswith(ext) for ext in EXCLUDE_EXTS):
                continue
            file_path = Path(root) / f
            # Use forward slashes for cross-platform zip compatibility
            rel_path = file_path.relative_to(src_dir).as_posix()
            zipf.write(file_path, arcname=rel_path)
            total_files += 1

# Replace project root zip
if workspace_zip.exists():
    workspace_zip.unlink()
temp_zip.rename(workspace_zip)

file_size_mb = workspace_zip.stat().st_size / (1024 * 1024)
print(f"Created {workspace_zip} with {total_files} files ({file_size_mb:.2f} MB)")

# Copy to Desktop
shutil.copy2(workspace_zip, desktop_zip)
print(f"Updated Desktop zip: {desktop_zip}")

# Copy to outputs/ if directory exists
if (src_dir / "outputs").exists():
    shutil.copy2(workspace_zip, outputs_zip)
    print(f"Updated outputs zip: {outputs_zip}")

# Also update Codex folder if it exists
if codex_dir.exists():
    try:
        shutil.copy2(workspace_zip, codex_dir / "sentinel-flow-ai-demo.zip")
        print(f"Updated Codex zip: {codex_dir / 'sentinel-flow-ai-demo.zip'}")
        if (codex_dir / "outputs").exists():
            shutil.copy2(workspace_zip, codex_dir / "outputs" / "sentinel-flow-ai-demo.zip")
            print(f"Updated Codex outputs zip: {codex_dir / 'outputs' / 'sentinel-flow-ai-demo.zip'}")
    except Exception as e:
        print(f"Codex copy warning: {e}")

print(">>> ALL ZIP ARCHIVES SUCCESSFULLY UPDATED! <<<")
