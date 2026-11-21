import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { EventType, PreferenceSnapshot } from '@flight-on-time/contracts';
import type { SqliteDatabase } from '../storage/database.js';

export type NotificationPlatform = 'android' | 'web';
export type DeliveryStatus = 'sent' | 'failed' | 'invalidated';

export interface DeviceInstallationRecord {
  installationId: string;
  accountId: string | null;
  platform: NotificationPlatform;
  claimedAt: string | null;
  createdAt: string;
}

export interface EligibleAlertTarget {
  installationId: string;
  accountId: string;
  platform: NotificationPlatform;
  endpointOrTokenCiphertext: string;
  preferences: PreferenceSnapshot;
}

export class InstallationConflictError extends Error {
  constructor() {
    super('Installation is already associated with another account.');
    this.name = 'InstallationConflictError';
  }
}

export class InstallationNotFoundError extends Error {
  constructor() {
    super('Installation not found.');
    this.name = 'InstallationNotFoundError';
  }
}

export class InvalidInstallationCredentialError extends Error {
  constructor() {
    super('Missing or invalid installation credential.');
    this.name = 'InvalidInstallationCredentialError';
  }
}

export class InstallationPlatformMismatchError extends Error {
  constructor() {
    super('Subscription platform must match installation platform.');
    this.name = 'InstallationPlatformMismatchError';
  }
}

export function hashInstallationCredential(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

export class PushSecretCipher {
  private readonly key: Buffer;

  constructor(rawKey: string) {
    if (!rawKey) {
      throw new Error('PUSH_ENCRYPTION_KEY must be configured and non-empty.');
    }

    this.key = /^[0-9a-f]{64}$/i.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : createHash('sha256').update(rawKey, 'utf8').digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(ciphertextEnvelope: string): string {
    const [ivPart, tagPart, dataPart] = ciphertextEnvelope.split('.');
    if (!ivPart || !tagPart || !dataPart) {
      throw new Error('Malformed encrypted push subscription secret.');
    }

    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(tagPart, 'base64url');
    const encrypted = Buffer.from(dataPart, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}

export class SqliteNotificationRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly cipher: PushSecretCipher,
  ) {}

  registerInstallation(
    platform: NotificationPlatform,
    createdAt: string,
  ): { installationId: string; installationCredential: string } {
    const installationId = randomUUID();
    const installationCredential = randomBytes(32).toString('base64url');
    const credentialHash = hashInstallationCredential(installationCredential);

    this.database
      .prepare(
        `
        INSERT INTO device_installations (
          installation_id, account_id, platform, installation_credential_hash, claimed_at, created_at
        ) VALUES (?, NULL, ?, ?, NULL, ?)
      `,
      )
      .run(installationId, platform, credentialHash, createdAt);

    return { installationId, installationCredential };
  }

  verifyInstallationCredential(
    installationId: string,
    credential: string,
  ): DeviceInstallationRecord {
    const credentialHash = hashInstallationCredential(credential);
    const row = this.database
      .prepare(
        `
        SELECT installation_id, account_id, platform, claimed_at, created_at, installation_credential_hash
        FROM device_installations
        WHERE installation_id = ?
      `,
      )
      .get(installationId) as
      | {
          installation_id: string;
          account_id: string | null;
          platform: NotificationPlatform;
          claimed_at: string | null;
          created_at: string;
          installation_credential_hash: string;
        }
      | undefined;

    if (!row) {
      throw new InstallationNotFoundError();
    }

    if (row.installation_credential_hash !== credentialHash) {
      throw new InvalidInstallationCredentialError();
    }

    return {
      installationId: row.installation_id,
      accountId: row.account_id,
      platform: row.platform,
      claimedAt: row.claimed_at,
      createdAt: row.created_at,
    };
  }

  claimInstallation(input: {
    installationId: string;
    credential: string;
    accountId: string;
    sessionPlatform: NotificationPlatform;
    claimedAt: string;
  }): void {
    const applyClaim = this.database.transaction(() => {
      const installation = this.verifyInstallationCredential(
        input.installationId,
        input.credential,
      );

      if (installation.platform !== input.sessionPlatform) {
        throw new InvalidInstallationCredentialError();
      }

      if (installation.accountId && installation.accountId !== input.accountId) {
        throw new InstallationConflictError();
      }

      this.database
        .prepare(
          `
          UPDATE device_installations
          SET account_id = ?, claimed_at = ?
          WHERE installation_id = ?
        `,
        )
        .run(input.accountId, input.claimedAt, input.installationId);
    });

    applyClaim();
  }

  unlinkInstallation(input: {
    installationId: string;
    credential: string;
    accountId: string;
    unlinkedAt: string;
  }): void {
    const applyUnlink = this.database.transaction(() => {
      const installation = this.verifyInstallationCredential(
        input.installationId,
        input.credential,
      );

      if (installation.accountId !== input.accountId) {
        throw new InstallationNotFoundError();
      }

      this.database
        .prepare(
          `
          UPDATE device_installations
          SET account_id = NULL, claimed_at = NULL
          WHERE installation_id = ? AND account_id = ?
        `,
        )
        .run(input.installationId, input.accountId);

      this.database
        .prepare(
          `
          UPDATE push_subscriptions
          SET enabled = 0, updated_at = ?
          WHERE installation_id = ?
        `,
        )
        .run(input.unlinkedAt, input.installationId);
    });

    applyUnlink();
  }

  upsertPushSubscription(input: {
    installationId: string;
    credential: string;
    accountId: string;
    platform: NotificationPlatform;
    subscriptionSecretJson: string;
    recordedAt: string;
  }): void {
    const applyUpsert = this.database.transaction(() => {
      const installation = this.verifyInstallationCredential(
        input.installationId,
        input.credential,
      );

      if (installation.accountId !== input.accountId) {
        throw new InstallationNotFoundError();
      }

      if (installation.platform !== input.platform) {
        throw new InstallationPlatformMismatchError();
      }

      const ciphertext = this.cipher.encrypt(input.subscriptionSecretJson);

      this.database
        .prepare(
          `
          INSERT INTO push_subscriptions (
            installation_id, platform, endpoint_or_token_ciphertext, consent_at, enabled, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT (installation_id) DO UPDATE SET
            platform = excluded.platform,
            endpoint_or_token_ciphertext = excluded.endpoint_or_token_ciphertext,
            consent_at = excluded.consent_at,
            enabled = 1,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          input.installationId,
          input.platform,
          ciphertext,
          input.recordedAt,
          input.recordedAt,
        );
    });

    applyUpsert();
  }

  disablePushSubscription(input: {
    installationId: string;
    credential: string;
    accountId: string;
    updatedAt: string;
  }): void {
    const applyDisable = this.database.transaction(() => {
      const installation = this.verifyInstallationCredential(
        input.installationId,
        input.credential,
      );

      if (installation.accountId !== input.accountId) {
        throw new InstallationNotFoundError();
      }

      this.database
        .prepare(
          `
          UPDATE push_subscriptions
          SET enabled = 0, updated_at = ?
          WHERE installation_id = ?
        `,
        )
        .run(input.updatedAt, input.installationId);
    });

    applyDisable();
  }

  listEligibleAlertTargets(): EligibleAlertTarget[] {
    const rows = this.database
      .prepare(
        `
        SELECT
          d.installation_id,
          d.account_id,
          d.platform,
          p.endpoint_or_token_ciphertext,
          ap.revision,
          ap.notifications_enabled,
          ap.updated_at
        FROM device_installations d
        INNER JOIN push_subscriptions p ON p.installation_id = d.installation_id
        INNER JOIN account_preferences ap ON ap.account_id = d.account_id
        WHERE d.account_id IS NOT NULL
          AND p.enabled = 1
          AND ap.notifications_enabled = 1
      `,
      )
      .all() as {
      installation_id: string;
      account_id: string;
      platform: NotificationPlatform;
      endpoint_or_token_ciphertext: string;
      revision: number;
      notifications_enabled: number;
      updated_at: string;
    }[];

    const selectAirports = this.database.prepare(
      'SELECT airport_icao FROM preference_airports WHERE account_id = ?',
    );
    const selectAirlines = this.database.prepare(
      'SELECT airline_id FROM preference_airlines WHERE account_id = ?',
    );
    const selectEventTypes = this.database.prepare(
      'SELECT event_type FROM preference_event_types WHERE account_id = ?',
    );

    return rows.map((row) => {
      const airports = (selectAirports.all(row.account_id) as { airport_icao: string }[]).map(
        (r) => r.airport_icao,
      );
      const airlines = (selectAirlines.all(row.account_id) as { airline_id: string }[]).map(
        (r) => r.airline_id,
      );
      const eventTypes = (selectEventTypes.all(row.account_id) as { event_type: EventType }[]).map(
        (r) => r.event_type,
      );

      return {
        installationId: row.installation_id,
        accountId: row.account_id,
        platform: row.platform,
        endpointOrTokenCiphertext: row.endpoint_or_token_ciphertext,
        preferences: {
          airportIcaos: airports,
          airlineIds: airlines,
          eventTypes,
          notificationsEnabled: row.notifications_enabled === 1,
          revision: row.revision,
          updatedAt: row.updated_at,
        },
      };
    });
  }

  decryptSubscriptionSecret(ciphertext: string): string {
    return this.cipher.decrypt(ciphertext);
  }

  claimDeliverySlot(input: {
    eventId: string;
    accountId: string;
    installationId: string;
    sentAt: string;
  }): boolean {
    const result = this.database
      .prepare(
        `
        INSERT INTO notification_deliveries (event_id, account_id, installation_id, sent_at, status)
        VALUES (?, ?, ?, ?, 'sent')
        ON CONFLICT (event_id, account_id, installation_id) DO NOTHING
      `,
      )
      .run(input.eventId, input.accountId, input.installationId, input.sentAt);

    return result.changes === 1;
  }

  updateDeliveryStatus(input: {
    eventId: string;
    accountId: string;
    installationId: string;
    status: DeliveryStatus;
    updatedAt: string;
  }): void {
    const applyStatus = this.database.transaction(() => {
      this.database
        .prepare(
          `
          UPDATE notification_deliveries
          SET status = ?, sent_at = ?
          WHERE event_id = ? AND account_id = ? AND installation_id = ?
        `,
        )
        .run(
          input.status,
          input.updatedAt,
          input.eventId,
          input.accountId,
          input.installationId,
        );

      if (input.status === 'invalidated') {
        this.database
          .prepare(
            `
            UPDATE push_subscriptions
            SET enabled = 0, updated_at = ?
            WHERE installation_id = ?
          `,
          )
          .run(input.updatedAt, input.installationId);
      }
    });

    applyStatus();
  }

  pruneDeliveriesOlderThan(cutoffIso: string): number {
    const result = this.database
      .prepare('DELETE FROM notification_deliveries WHERE sent_at < ?')
      .run(cutoffIso);
    return result.changes;
  }
}
