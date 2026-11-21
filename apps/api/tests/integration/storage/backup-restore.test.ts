import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteAuthRepository } from '../../../src/auth/auth-repository.js';
import {
  PushSecretCipher,
  SqliteNotificationRepository,
} from '../../../src/notifications/notification-repository.js';
import { SqlitePreferenceRepository } from '../../../src/preferences/preference-repository.js';
import {
  backupDatabase,
  openDatabase,
  runMigrations,
} from '../../../src/storage/database.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('SQLite online backup and restore', () => {
  let temporaryDirectory: string | undefined;
  let sourceDb: InstanceType<typeof Database> | undefined;
  let restoredDb: InstanceType<typeof Database> | undefined;

  afterEach(() => {
    sourceDb?.close();
    sourceDb = undefined;
    restoredDb?.close();
    restoredDb = undefined;

    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it('creates a consistent online backup that restores identities, preference revisions, and claimed installations without raw secrets', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'flight-on-time-backup-'));
    const sourcePath = join(temporaryDirectory, 'live.sqlite');
    const backupPath = join(temporaryDirectory, 'backups', 'snapshot.sqlite');
    const migrationsDir = resolve('apps/api/src/storage/migrations');

    sourceDb = openDatabase(sourcePath);
    runMigrations(sourceDb, migrationsDir);

    const authRepo = new SqliteAuthRepository(sourceDb, {
      generateAccountId: () => 'account-backup-1',
      generateSessionToken: () => 'raw-session-secret-token',
    });

    const rawChallengeId = 'raw-challenge-id';
    const rawNonce = 'raw-nonce-secret';
    authRepo.createChallenge({
      challengeIdHash: sha256(rawChallengeId),
      nonceHash: sha256(rawNonce),
      platform: 'android',
      createdAt: '2026-11-18T12:00:00.000Z',
      expiresAt: '2026-11-18T12:05:00.000Z',
    });
    authRepo.completeExchange({
      challengeIdHash: sha256(rawChallengeId),
      platform: 'android',
      consumedAt: '2026-11-18T12:01:00.000Z',
      issuer: 'https://accounts.google.com',
      subject: 'google-sub-backup',
    });

    // Seed verified airline reference required by preference foreign key
    sourceDb
      .prepare(
        `INSERT INTO airline_references (airline_id, display_name, source_id, source_updated_at)
         VALUES ('LATAM', 'LATAM Airlines Brasil', 'fixture-operator-registry', '2026-11-18T12:00:00.000Z')`,
      )
      .run();

    const prefRepo = new SqlitePreferenceRepository(sourceDb);
    prefRepo.replaceSnapshot({
      accountId: 'account-backup-1',
      expectedRevision: 0,
      update: {
        airportIcaos: ['SBBR'],
        airlineIds: ['LATAM'],
        eventTypes: ['go_around'],
        notificationsEnabled: true,
      },
      updatedAt: '2026-11-18T12:02:00.000Z',
    });

    const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const notifRepo = new SqliteNotificationRepository(
      sourceDb,
      new PushSecretCipher(encryptionKey),
    );
    const installation = notifRepo.registerInstallation('android', '2026-11-18T12:02:00.000Z');
    notifRepo.claimInstallation({
      installationId: installation.installationId,
      credential: installation.installationCredential,
      accountId: 'account-backup-1',
      sessionPlatform: 'android',
      claimedAt: '2026-11-18T12:02:30.000Z',
    });

    const rawPushToken = 'fcm-secret-token-never-plaintext';
    notifRepo.upsertPushSubscription({
      installationId: installation.installationId,
      credential: installation.installationCredential,
      accountId: 'account-backup-1',
      platform: 'android',
      subscriptionSecretJson: JSON.stringify({ token: rawPushToken }),
      recordedAt: '2026-11-18T12:03:00.000Z',
    });

    // Perform online consistent SQLite backup while sourceDb remains open
    await backupDatabase(sourceDb, backupPath);

    restoredDb = openDatabase(backupPath);
    expect(restoredDb.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(restoredDb.pragma('integrity_check', { simple: true })).toBe('ok');

    const restoredPrefRepo = new SqlitePreferenceRepository(restoredDb);
    expect(restoredPrefRepo.getSnapshot('account-backup-1')).toEqual({
      airportIcaos: ['SBBR'],
      airlineIds: ['LATAM'],
      eventTypes: ['go_around'],
      notificationsEnabled: true,
      revision: 1,
      updatedAt: '2026-11-18T12:02:00.000Z',
    });

    const restoredSubRow = restoredDb
      .prepare('SELECT endpoint_or_token_ciphertext FROM push_subscriptions WHERE installation_id = ?')
      .get(installation.installationId) as { endpoint_or_token_ciphertext: string };
    expect(restoredSubRow.endpoint_or_token_ciphertext).not.toContain(rawPushToken);

    const restoredSessionRow = restoredDb
      .prepare('SELECT session_id_hash FROM account_sessions WHERE account_id = ?')
      .get('account-backup-1') as { session_id_hash: string };
    expect(restoredSessionRow.session_id_hash).toBe(sha256('raw-session-secret-token'));
  });
});
