import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteAuthRepository } from '../../../src/auth/auth-repository.js';
import { openDatabase, runMigrations } from '../../../src/storage/database.js';

const now = '2026-11-18T12:00:00.000Z';

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('SQLite auth repository', () => {
  let temporaryDirectory: string | undefined;
  let database: InstanceType<typeof Database> | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;

    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  function createRepository() {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'flight-on-time-auth-'));
    database = openDatabase(join(temporaryDirectory, 'test.sqlite'));
    runMigrations(database, resolve('apps/api/src/storage/migrations'));

    return new SqliteAuthRepository(database);
  }

  it('stores only challenge hashes and issues a hashed, single-use application session', () => {
    const repository = createRepository();
    const challengeId = 'raw-challenge-id';
    const nonce = 'raw-google-nonce';
    const challenge = {
      challengeIdHash: hash(challengeId),
      nonceHash: hash(nonce),
      platform: 'android' as const,
      createdAt: now,
      expiresAt: '2026-11-18T12:05:00.000Z',
    };

    repository.createChallenge(challenge);
    if (!database) {
      throw new Error('Test database was not initialized');
    }

    expect(repository.findChallenge(challenge.challengeIdHash)).toMatchObject({
      ...challenge,
      consumedAt: null,
    });
    expect(database?.prepare('SELECT * FROM google_auth_challenges').get()).not.toMatchObject({
      challenge_id_hash: challengeId,
      nonce_hash: nonce,
    });

    const repositoryWithStableToken = new SqliteAuthRepository(database, {
      generateSessionToken: () => 'one-time-session-token',
      generateAccountId: () => 'account-id',
    });
    const session = repositoryWithStableToken.completeExchange({
      challengeIdHash: challenge.challengeIdHash,
      platform: 'android',
      consumedAt: now,
      issuer: 'https://accounts.google.com',
      subject: 'google-subject-123',
    });

    expect(session?.sessionToken).toBeTruthy();
    expect(
      database?.prepare('SELECT session_id_hash, account_id FROM account_sessions').get(),
    ).toEqual({
      session_id_hash: hash('one-time-session-token'),
      account_id: 'account-id',
    });
    expect(
      repositoryWithStableToken.completeExchange({
        challengeIdHash: challenge.challengeIdHash,
        platform: 'android',
        consumedAt: now,
        issuer: 'https://accounts.google.com',
        subject: 'google-subject-123',
      }),
    ).toBeUndefined();
    expect(
      repositoryWithStableToken.findActiveSession(hash('one-time-session-token'), now),
    ).toMatchObject({
      accountId: 'account-id',
      platform: 'android',
      revokedAt: null,
    });
    expect(repositoryWithStableToken.revokeSession(hash('one-time-session-token'), now)).toBe(true);
    expect(
      repositoryWithStableToken.findActiveSession(hash('one-time-session-token'), now),
    ).toBeUndefined();
  });

  it('does not consume a challenge when its platform or expiry does not match', () => {
    const repository = createRepository();
    const challengeIdHash = hash('challenge');
    repository.createChallenge({
      challengeIdHash,
      nonceHash: hash('nonce'),
      platform: 'web',
      createdAt: now,
      expiresAt: '2026-11-18T12:05:00.000Z',
    });

    expect(
      repository.completeExchange({
        challengeIdHash,
        platform: 'android',
        consumedAt: now,
        issuer: 'https://accounts.google.com',
        subject: 'google-subject-123',
      }),
    ).toBeUndefined();
    expect(
      repository.completeExchange({
        challengeIdHash,
        platform: 'web',
        consumedAt: '2026-11-18T12:05:00.000Z',
        issuer: 'https://accounts.google.com',
        subject: 'google-subject-123',
      }),
    ).toBeUndefined();
    expect(repository.findChallenge(challengeIdHash)?.consumedAt).toBeNull();
  });
});
