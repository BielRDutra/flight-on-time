import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthPlatform } from './google-auth-service.js';
import type {
  ActiveAccountSession,
  ApplicationSession,
  GoogleAuthChallenge,
  GoogleAuthRepository,
} from './google-auth-service.js';
import type { SqliteDatabase } from '../storage/database.js';

interface ChallengeInput {
  challengeIdHash: string;
  nonceHash: string;
  platform: AuthPlatform;
  createdAt: string;
  expiresAt: string;
}

interface SessionRecord {
  session_id_hash: string;
  account_id: string;
  platform: AuthPlatform;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

interface AuthRepositoryOptions {
  sessionLifetimeMs?: number;
  generateSessionToken?: () => string;
  generateAccountId?: () => string;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class SqliteAuthRepository implements GoogleAuthRepository {
  private readonly sessionLifetimeMs: number;
  private readonly generateSessionToken: () => string;
  private readonly generateAccountId: () => string;

  constructor(
    private readonly database: SqliteDatabase,
    options: AuthRepositoryOptions = {},
  ) {
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
    this.generateSessionToken =
      options.generateSessionToken ?? (() => randomBytes(32).toString('base64url'));
    this.generateAccountId = options.generateAccountId ?? randomUUID;
  }

  createChallenge(input: ChallengeInput): void {
    if (!HASH_PATTERN.test(input.challengeIdHash) || !HASH_PATTERN.test(input.nonceHash)) {
      throw new Error('Challenge identifiers must be SHA-256 hashes');
    }

    this.database
      .prepare(
        `
        INSERT INTO google_auth_challenges (
          challenge_id_hash, nonce_hash, platform, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.challengeIdHash,
        input.nonceHash,
        input.platform,
        input.createdAt,
        input.expiresAt,
      );
  }

  findChallenge(challengeIdHash: string): GoogleAuthChallenge | undefined {
    const row = this.database
      .prepare(
        `
        SELECT challenge_id_hash, nonce_hash, platform, created_at, expires_at, consumed_at
        FROM google_auth_challenges
        WHERE challenge_id_hash = ?
      `,
      )
      .get(challengeIdHash) as
      | {
          challenge_id_hash: string;
          nonce_hash: string;
          platform: AuthPlatform;
          created_at: string;
          expires_at: string;
          consumed_at: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      challengeIdHash: row.challenge_id_hash,
      nonceHash: row.nonce_hash,
      platform: row.platform,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  completeExchange(input: {
    challengeIdHash: string;
    platform: AuthPlatform;
    consumedAt: string;
    issuer: string;
    subject: string;
  }): ApplicationSession | undefined {
    const transaction = this.database.transaction(() => {
      const consumed = this.database
        .prepare(
          `
          UPDATE google_auth_challenges
          SET consumed_at = ?
          WHERE challenge_id_hash = ?
            AND platform = ?
            AND consumed_at IS NULL
            AND expires_at > ?
        `,
        )
        .run(input.consumedAt, input.challengeIdHash, input.platform, input.consumedAt);

      if (consumed.changes !== 1) {
        return undefined;
      }

      this.database
        .prepare(
          `
          INSERT INTO account_identities (account_id, issuer, subject, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (issuer, subject) DO NOTHING
        `,
        )
        .run(this.generateAccountId(), input.issuer, input.subject, input.consumedAt);

      const account = this.database
        .prepare(
          `
          SELECT account_id
          FROM account_identities
          WHERE issuer = ? AND subject = ?
        `,
        )
        .get(input.issuer, input.subject) as { account_id: string } | undefined;

      if (!account) {
        throw new Error('Google identity could not be persisted');
      }

      const sessionToken = this.generateSessionToken();
      const sessionIdHash = hashSecret(sessionToken);
      const expiresAt = new Date(
        Date.parse(input.consumedAt) + this.sessionLifetimeMs,
      ).toISOString();

      this.database
        .prepare(
          `
          INSERT INTO account_sessions (
            session_id_hash, account_id, platform, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run(sessionIdHash, account.account_id, input.platform, input.consumedAt, expiresAt);

      return { sessionToken, expiresAt };
    });

    return transaction();
  }

  findActiveSession(sessionIdHash: string, at: string): ActiveAccountSession | undefined {
    const row = this.database
      .prepare(
        `
        SELECT session_id_hash, account_id, platform, created_at, expires_at, revoked_at
        FROM account_sessions
        WHERE session_id_hash = ?
          AND revoked_at IS NULL
          AND expires_at > ?
      `,
      )
      .get(sessionIdHash, at) as SessionRecord | undefined;

    if (!row) {
      return undefined;
    }

    return {
      accountId: row.account_id,
      platform: row.platform,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: null,
    };
  }

  revokeSession(sessionIdHash: string, revokedAt: string): boolean {
    const result = this.database
      .prepare(
        `
        UPDATE account_sessions
        SET revoked_at = ?
        WHERE session_id_hash = ? AND revoked_at IS NULL
      `,
      )
      .run(revokedAt, sessionIdHash);

    return result.changes === 1;
  }
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
