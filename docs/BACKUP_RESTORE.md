# Sentinel Flow: Backup & Restore Guide

Sentinel Flow supports dual database persistence: **PostgreSQL 16** (recommended for production/Docker Compose) and **SQLite** (for zero-install local development).

## 1. Automated Backups

Run the unified backup utility:
```bash
bash scripts/backup.sh
```

The script inspects `DATABASE_URL`. If pointing to PostgreSQL, it executes a streaming `pg_dump | gzip`. If using local SQLite, it performs an online atomic `.backup` to `./backups/`.

---

## 2. PostgreSQL 16 (Docker / Production)

### Backup
```bash
# Via Docker Compose container
docker exec -t sentinel-postgres pg_dump -U sentinel sentinel_flow | gzip > backups/sentinel_pg_$(date +%Y%m%d_%H%M%S).sql.gz

# Or directly using database connection string
pg_dump "$DATABASE_URL" | gzip > backups/sentinel_pg.sql.gz
```

### Restore
```bash
# 1. Terminate active backend connections
docker compose stop backend

# 2. Restore schema and data
gunzip -c backups/sentinel_pg.sql.gz | docker exec -i sentinel-postgres psql -U sentinel -d sentinel_flow

# 3. Restart backend
docker compose start backend
```

---

## 3. SQLite Local Mode

### Backup
```bash
# Online atomic backup (safe even while server is running)
sqlite3 backend/runtime/sentinel_demo.db ".backup 'backups/sentinel_backup.db'"
```

### Restore
```bash
# Stop backend, copy backup file over runtime database, restart backend
cp backups/sentinel_backup.db backend/runtime/sentinel_demo.db
```
