import os
import shutil
import zipfile
from pathlib import Path

desktop_dir = Path(r"C:\Users\madha\Desktop\Sentinel-Flow-AI-Demo").resolve()
desktop_zip = Path(r"C:\Users\madha\Desktop\sentinel-flow-ai-demo.zip")
workspace_zip = desktop_dir / "sentinel-flow-ai-demo.zip"
workspace = desktop_dir

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
}

EXCLUDE_EXTS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".DS_Store",
}

EXCLUDE_FILES = {
    "sentinel-flow-ai-demo.zip",
    "sentinel_flow.db",
}

print(f"1. Synchronizing workspace files to {desktop_dir}...")
desktop_dir.mkdir(parents=True, exist_ok=True)

copied_count = 0
for root, dirs, files in os.walk(workspace):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".git")]
    for f in files:
        if f in EXCLUDE_FILES or any(f.endswith(ext) for ext in EXCLUDE_EXTS):
            continue
        src_path = Path(root) / f
        rel_path = src_path.relative_to(workspace)
        dst_path = desktop_dir / rel_path
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        copied_count += 1

print(f"   Synchronized {copied_count} files to Desktop folder.")

print(f"2. Creating fresh zip archive at {workspace_zip}...")
total_files = 0
with zipfile.ZipFile(workspace_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zipf:
    for root, dirs, files in os.walk(workspace):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".git")]
        for f in files:
            if f in EXCLUDE_FILES or any(f.endswith(ext) for ext in EXCLUDE_EXTS):
                continue
            src_path = Path(root) / f
            rel_path = src_path.relative_to(workspace)
            zipf.write(src_path, arcname=str(rel_path))
            total_files += 1

print(f"   Archived {total_files} files into zip.")
print(f"   Zip size: {workspace_zip.stat().st_size / (1024*1024):.2f} MB")

print("3. Copying zip to Desktop locations...")
shutil.copy2(workspace_zip, desktop_zip)
print(f"   Copied to {desktop_zip}")
shutil.copy2(workspace_zip, desktop_dir / "sentinel-flow-ai-demo.zip")
print(f"   Copied to {desktop_dir / 'sentinel-flow-ai-demo.zip'}")

print(">>> DESKTOP FOLDER AND ZIP FULLY SYNCHRONIZED! <<<")
