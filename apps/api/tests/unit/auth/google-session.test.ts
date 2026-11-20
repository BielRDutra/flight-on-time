import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleAuthError,
  GoogleAuthService,
  GoogleTokenVerificationError,
  type GoogleAuthRepository,
  type GoogleIdTokenVerifier,
  type GoogleTokenClaims,
} from '../../../src/auth/google-auth-service.js';

const now = new Date('2026-11-18T12:00:00.000Z');
const challengeId = 'single-use-challenge';
const nonce = 'bound-google-nonce';
const challenge = {
  challengeIdHash: hash(challengeId),
  nonceHash: hash(nonce),
  platform: 'android' as const,
  createdAt: '2026-11-18T11:59:00.000Z',
  expiresAt: '2026-11-18T12:05:00.000Z',
  consumedAt: null as string | null,
};
const applicationSession = {
  sessionToken: 'opaque-application-session',
  expiresAt: '2026-11-19T12:00:00.000Z',
};

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validClaims(overrides: Partial<GoogleTokenClaims> = {}): GoogleTokenClaims {
  return {
    issuer: 'https://accounts.google.com',
    subject: 'google-subject-123',
    audience: 'web-server-client-id',
    expiresAt: Math.floor(now.getTime() / 1000) + 60,
    nonce,
    ...overrides,
  };
}

function createService(
  options: {
    claims?: GoogleTokenClaims;
    challengeRecord?: typeof challenge;
    verificationError?: Error;
    session?: typeof applicationSession | undefined;
  } = {},
) {
  const verifier: GoogleIdTokenVerifier = {
    verifyIdToken: vi.fn(async () => {
      if (options.verificationError) {
        throw options.verificationError;
      }

      return options.claims ?? validClaims();
    }),
  };
  const repository: GoogleAuthRepository = {
    createChallenge: vi.fn(),
    findChallenge: vi.fn(() => options.challengeRecord ?? challenge),
    completeExchange: vi.fn(() => options.session ?? applicationSession),
    findActiveSession: vi.fn(),
    revokeSession: vi.fn(() => true),
  };
  const service = new GoogleAuthService({
    allowedAudiences: {
      web: ['web-client-id'],
      android: ['web-server-client-id'],
    },
    repository,
    verifier,
    now: () => now,
  });

  return { service, verifier, repository };
}

describe('Google application-session exchange', () => {
  it('creates a short-lived challenge and stores only its hashes', () => {
    const { service, repository } = createService();
    const result = service.createChallenge('android');

    expect(result.challengeId).not.toBe(result.nonce);
    expect(Date.parse(result.expiresAt) - now.getTime()).toBe(5 * 60 * 1000);
    expect(repository.createChallenge).toHaveBeenCalledWith({
      challengeIdHash: hash(result.challengeId),
      nonceHash: hash(result.nonce),
      platform: 'android',
      createdAt: now.toISOString(),
      expiresAt: result.expiresAt,
    });
  });

  it('rejects credentials whose signature verification fails', async () => {
    const { service, repository } = createService({
      verificationError: new GoogleTokenVerificationError(),
    });

    await expect(
      service.exchange({ platform: 'android', challengeId, credential: 'invalid-token' }),
    ).rejects.toMatchObject({ code: 'invalid_credential' });
    expect(repository.completeExchange).not.toHaveBeenCalled();
  });

  it.each([
    ['issuer', { issuer: 'https://attacker.example' }],
    ['audience', { audience: 'unknown-client-id' }],
    ['expiry', { expiresAt: Math.floor(now.getTime() / 1000) - 1 }],
    ['nonce', { nonce: 'different-nonce' }],
  ])('rejects an invalid Google %s claim', async (_claim, claims) => {
    const { service, repository } = createService({ claims: validClaims(claims) });

    await expect(
      service.exchange({ platform: 'android', challengeId, credential: 'signed-token' }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
    expect(repository.completeExchange).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge without verifying the token', async () => {
    const expiredChallenge = {
      ...challenge,
      expiresAt: '2026-11-18T11:59:59.000Z',
    };
    const { service, verifier, repository } = createService({
      challengeRecord: expiredChallenge,
    });

    await expect(
      service.exchange({ platform: 'android', challengeId, credential: 'signed-token' }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
    expect(repository.completeExchange).not.toHaveBeenCalled();
  });

  it('rejects a challenge that has already been consumed', async () => {
    const usedChallenge = {
      ...challenge,
      consumedAt: '2026-11-18T11:59:30.000Z',
    };
    const { service, verifier, repository } = createService({
      challengeRecord: usedChallenge,
    });

    await expect(
      service.exchange({ platform: 'android', challengeId, credential: 'signed-token' }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
    expect(repository.completeExchange).not.toHaveBeenCalled();
  });

  it('issues an application session and atomically consumes a valid challenge', async () => {
    const { service, verifier, repository } = createService();

    await expect(
      service.exchange({ platform: 'android', challengeId, credential: 'signed-token' }),
    ).resolves.toEqual(applicationSession);
    expect(verifier.verifyIdToken).toHaveBeenCalledWith('signed-token', ['web-server-client-id']);
    expect(repository.completeExchange).toHaveBeenCalledWith({
      challengeIdHash: hash(challengeId),
      platform: 'android',
      consumedAt: now.toISOString(),
      issuer: 'https://accounts.google.com',
      subject: 'google-subject-123',
    });
  });

  it('rejects a challenge consumed concurrently by another exchange', async () => {
    const repository = {
      createChallenge: vi.fn(),
      findChallenge: vi.fn(() => challenge),
      completeExchange: vi.fn(() => undefined),
      findActiveSession: vi.fn(),
      revokeSession: vi.fn(() => true),
    } satisfies GoogleAuthRepository;
    const verifier: GoogleIdTokenVerifier = {
      verifyIdToken: vi.fn(async () => validClaims()),
    };
    const racingService = new GoogleAuthService({
      allowedAudiences: { web: ['web-client-id'], android: ['web-server-client-id'] },
      repository,
      verifier,
      now: () => now,
    });

    await expect(
      racingService.exchange({ platform: 'android', challengeId, credential: 'signed-token' }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
  });
});
