import {
  preferenceUpdateSchema,
  type PreferenceSnapshot,
} from '@flight-on-time/contracts';
import type { PreferenceRepository } from './preference-repository.js';

export class InvalidPreferenceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPreferenceRequestError';
  }
}

export interface PreferenceResult {
  snapshot: PreferenceSnapshot;
  etag: string;
}

export class PreferenceService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: PreferenceRepository,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  getPreferences(accountId: string): PreferenceResult {
    const snapshot = this.repository.getSnapshot(accountId);
    return {
      snapshot,
      etag: formatRevisionETag(snapshot.revision),
    };
  }

  updatePreferences(
    accountId: string,
    ifMatchHeader: string | string[] | undefined,
    payload: unknown,
  ): PreferenceResult {
    const expectedRevision = parseIfMatchRevision(ifMatchHeader);
    const parsed = preferenceUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      throw new InvalidPreferenceRequestError(
        parsed.error.issues[0]?.message ?? 'Invalid preference update payload.',
      );
    }

    const snapshot = this.repository.replaceSnapshot({
      accountId,
      expectedRevision,
      update: parsed.data,
      updatedAt: this.now().toISOString(),
    });

    return {
      snapshot,
      etag: formatRevisionETag(snapshot.revision),
    };
  }
}

export function formatRevisionETag(revision: number): string {
  return `"${revision}"`;
}

export function parseIfMatchRevision(headerValue: string | string[] | undefined): number {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) {
    throw new InvalidPreferenceRequestError('The If-Match header is required.');
  }

  const trimmed = raw.trim();
  const match = trimmed.match(/^"(\d+)"$/) ?? trimmed.match(/^(\d+)$/);
  if (!match?.[1]) {
    throw new InvalidPreferenceRequestError('The If-Match header must specify a numeric ETag.');
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidPreferenceRequestError('The If-Match revision is invalid.');
  }

  return parsed;
}
