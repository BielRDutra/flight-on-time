# SQLite Operations, Backup, and Restore Runbook

## Architecture Boundary

- The server uses SQLite in WAL (`journal_mode = WAL`) mode with `foreign_keys = ON` and `busy_timeout = 5000` configured on every database connection via `openDatabase`.
- **Single-Host / Single-Writer Rule**: Run only **one** API instance against the SQLite volume, and store the SQLite file on a **durable local filesystem** (never on NFS/SMB/network filesystems).
- **Scale-Out Trigger**: Migrate persistence and BFF sessions to PostgreSQL before deploying multiple API replicas, horizontal auto-scaling, or active-active high availability, or when write contention (`SQLITE_BUSY`) exceeds operational thresholds.

## Consistent Online Backup

Never copy an active `-wal` database file directly with plain file copy (`cp`/`Copy-Item`) while the service is running without quiescing, because `-wal` frames may not yet be checkpointed.

Use the SQLite Online Backup API via `backupDatabase(source, destinationPath)` in `apps/api/src/storage/database.ts`, or `sqlite3 <db_path> ".backup '<backup_path>'"`:

1. Ensure the destination directory is on a local or encrypted backup volume with restricted filesystem permissions.
2. Execute the online backup API so SQLite produces an internally consistent snapshot without stopping reads/writes.
3. Verify the backup file with:
   - `PRAGMA integrity_check;` (must return `ok`)
   - `PRAGMA foreign_keys = ON;` and `PRAGMA foreign_key_check;` (must return 0 violations)

## Restore Drill Procedure

1. Stop the API process so no writer holds the live database handle.
2. Move aside the corrupted database and any stale `-wal` / `-shm` sidecar files.
3. Copy the verified backup snapshot into `DATABASE_PATH`.
4. Run `npm --workspace apps/api run db:migrate` to confirm schema version alignment.
5. Start the API process and verify `GET /health/live` returns `200 { "status": "ok" }`.
6. Confirm account preference revisions, installation claims, and push subscription encryption remain intact and no plaintext tokens or raw flight history tables exist.

## Automated Verification

The automated integration test in `apps/api/tests/integration/storage/backup-restore.test.ts` exercises online WAL backup and clean restore verification.
