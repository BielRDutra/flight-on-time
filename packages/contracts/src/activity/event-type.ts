import { z } from 'zod';

export const EVENT_TYPES = ['go_around', 'holding_or_orbit', 'diversion_candidate'] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

export const SOURCE_STATUSES = ['current', 'stale', 'unavailable', 'limited'] as const;
export const sourceStatusSchema = z.enum(SOURCE_STATUSES);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const CLASSIFICATION_STATUSES = ['inferred', 'directly_reported'] as const;
export const classificationStatusSchema = z.enum(CLASSIFICATION_STATUSES);
export type ClassificationStatus = z.infer<typeof classificationStatusSchema>;

export const EVENT_LIFECYCLE_STATUSES = ['current', 'stale', 'expired'] as const;
export const eventLifecycleStatusSchema = z.enum(EVENT_LIFECYCLE_STATUSES);
export type EventLifecycleStatus = z.infer<typeof eventLifecycleStatusSchema>;
