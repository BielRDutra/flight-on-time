import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type AuthPlatform = 'web' | 'android';

export interface GoogleTokenClaims {
  issuer: string;
  subject: string;
  audience: string | string[];
  expiresAt: number;
  nonce?: string;
}

export interface GoogleIdTokenVerifier {
  verifyIdToken(token: string, audiences: readonly string[]): Promise<GoogleTokenClaims>;
}

export interface GoogleAuthChallenge {
  challengeIdHash: string;
  nonceHash: string;
  platform: AuthPlatform;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface ApplicationSession {
  sessionToken: string;
  expiresAt: string;
}

export interface ActiveAccountSession {
  accountId: string;
  platform: AuthPlatform;
  createdAt: string;
  expiresAt: string;
  revokedAt: null;
}

export interface GoogleAuthRepository {
  createChallenge(input: {
    challengeIdHash: string;
    nonceHash: string;
    platform: AuthPlatform;
    createdAt: string;
    expiresAt: string;
  }): void;
  findChallenge(challengeIdHash: string): GoogleAuthChallenge | undefined;
  completeExchange(input: {
    challengeIdHash: string;
    platform: AuthPlatform;
    consumedAt: string;
    issuer: string;
    subject: string;
  }): ApplicationSession | undefined;
  findActiveSession(sessionIdHash: string, at: string): ActiveAccountSession | undefined;
  revokeSession(sessionIdHash: string, revokedAt: string): boolean;
}

export type GoogleAuthErrorCode = 'invalid_credential' | 'invalid_challenge';

export class GoogleAuthError extends Error {
  constructor(readonly code: GoogleAuthErrorCode) {
    super(code);
    this.name = 'GoogleAuthError';
  }
}

export class GoogleTokenVerificationError extends Error {
  constructor(options?: ErrorOptions) {
    super('Google ID token verification failed', options);
    this.name = 'GoogleTokenVerificationError';
  }
}

interface GoogleAuthServiceOptions {
  allowedAudiences: Record<AuthPlatform, readonly string[]>;
  repository: GoogleAuthRepository;
  verifier: GoogleIdTokenVerifier;
  challengeLifetimeMs?: number;
  now?: () => Date;
}

interface ExchangeInput {
  platform: AuthPlatform;
  challengeId: string;
  credential: string;
}

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export class GoogleAuthService {
  private readonly now: () => Date;
  private readonly challengeLifetimeMs: number;

  constructor(private readonly options: GoogleAuthServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.challengeLifetimeMs = options.challengeLifetimeMs ?? 5 * 60 * 1000;
  }

  createChallenge(platform: AuthPlatform): {
    challengeId: string;
    nonce: string;
    expiresAt: string;
  } {
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.challengeLifetimeMs).toISOString();
    const challengeId = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');

    this.options.repository.createChallenge({
      challengeIdHash: hashSecret(challengeId),
      nonceHash: hashSecret(nonce),
      platform,
      createdAt: createdAt.toISOString(),
      expiresAt,
    });

    return { challengeId, nonce, expiresAt };
  }

  async exchange(input: ExchangeInput): Promise<ApplicationSession> {
    if (!input.challengeId || !input.credential) {
      throw new GoogleAuthError('invalid_credential');
    }

    const challengeIdHash = hashSecret(input.challengeId);
    const challenge = this.options.repository.findChallenge(challengeIdHash);
    const now = this.now();

    if (
      !challenge ||
      challenge.platform !== input.platform ||
      challenge.consumedAt !== null ||
      !Number.isFinite(Date.parse(challenge.expiresAt)) ||
      Date.parse(challenge.expiresAt) <= now.getTime()
    ) {
      throw new GoogleAuthError('invalid_challenge');
    }

    let claims: GoogleTokenClaims;
    try {
      claims = await this.options.verifier.verifyIdToken(
        input.credential,
        this.options.allowedAudiences[input.platform],
      );
    } catch (error) {
      if (error instanceof GoogleTokenVerificationError) {
        throw new GoogleAuthError('invalid_credential');
      }

      throw error;
    }

    const audiences = Array.isArray(claims.audience) ? claims.audience : [claims.audience];
    const expectedAudiences = this.options.allowedAudiences[input.platform];
    const normalizedIssuer = normalizeGoogleIssuer(claims.issuer);
    const nonceHash = claims.nonce ? hashSecret(claims.nonce) : '';

    if (
      !normalizedIssuer ||
      !isValidSubject(claims.subject) ||
      !audiences.some((audience) => expectedAudiences.includes(audience)) ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= Math.floor(now.getTime() / 1000) ||
      !nonceHash ||
      !matchesHash(nonceHash, challenge.nonceHash)
    ) {
      throw new GoogleAuthError('invalid_credential');
    }

    const session = this.options.repository.completeExchange({
      challengeIdHash,
      platform: input.platform,
      consumedAt: now.toISOString(),
      issuer: normalizedIssuer,
      subject: claims.subject,
    });

    if (!session) {
      throw new GoogleAuthError('invalid_challenge');
    }

    return session;
  }

  findActiveSession(sessionToken: string): ActiveAccountSession | undefined {
    if (!sessionToken) {
      return undefined;
    }

    return this.options.repository.findActiveSession(
      hashSecret(sessionToken),
      this.now().toISOString(),
    );
  }

  revokeSession(sessionToken: string): boolean {
    if (!sessionToken) {
      return false;
    }

    return this.options.repository.revokeSession(
      hashSecret(sessionToken),
      this.now().toISOString(),
    );
  }
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function matchesHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return (
    leftBuffer.length === 32 &&
    rightBuffer.length === 32 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizeGoogleIssuer(issuer: string): string | undefined {
  return GOOGLE_ISSUERS.has(issuer) ? 'https://accounts.google.com' : undefined;
}

function isValidSubject(subject: string): boolean {
  return /^[\x21-\x7e]{1,255}$/.test(subject);
}
