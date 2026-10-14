#!/usr/bin/env bash
# ==============================================================================
# Sentinel Flow: Database Backup & Restore Utility
# Supports PostgreSQL (pg_dump) in production / Docker and SQLite (VACUUM INTO)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$BACKUP_DIR"

if [ -n "${DATABASE_URL:-}" ] && [[ "$DATABASE_URL" == *"postgres"* ]]; then
    BACKUP_FILE="${BACKUP_DIR}/sentinel_postgres_${TIMESTAMP}.sql.gz"
    echo "Backing up PostgreSQL from DATABASE_URL to ${BACKUP_FILE}..."
    pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
    echo "Backup completed: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"
    echo ""
    echo "To restore:"
    echo "  gunzip -c ${BACKUP_FILE} | psql \"\$DATABASE_URL\""
else
    DB_FILE="${SQLITE_PATH:-backend/runtime/sentinel_demo.db}"
    BACKUP_FILE="${BACKUP_DIR}/sentinel_sqlite_${TIMESTAMP}.db"
    echo "Backing up local SQLite database from ${DB_FILE} to ${BACKUP_FILE}..."
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DB_FILE" ".backup '${BACKUP_FILE}'"
    else
        cp "$DB_FILE" "$BACKUP_FILE"
    fi
    echo "Backup completed: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"
    echo ""
    echo "To restore:"
    echo "  cp ${BACKUP_FILE} ${DB_FILE}"
fi
