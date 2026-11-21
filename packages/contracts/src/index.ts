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

export const AIRPORT_ICAO_PATTERN = /^[A-Z0-9]{4}$/;

export const airportIcaoSchema = z.string().regex(AIRPORT_ICAO_PATTERN, {
  message: 'Airport ICAO code must be 4 uppercase alphanumeric characters.',
});

export const airlineIdSchema = z.string().min(1).max(120);

export const airlineReferenceSchema = z.object({
  airlineId: airlineIdSchema,
  displayName: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUpdatedAt: z.string().datetime().nullable().optional(),
});
export type AirlineReference = z.infer<typeof airlineReferenceSchema>;

export const eventSourceObservationSchema = z.object({
  id: z.string().min(1),
  observedAt: z.string().datetime(),
});
export type EventSourceObservation = z.infer<typeof eventSourceObservationSchema>;

export const inferredEventSchema = z.object({
  eventId: z.string().min(1),
  airportIcao: airportIcaoSchema,
  eventType: eventTypeSchema,
  classificationStatus: classificationStatusSchema,
  airline: airlineReferenceSchema.nullable(),
  aircraftIcao24: z.string().min(1).nullable(),
  firstObservedAt: z.string().datetime(),
  lastObservedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  sources: z.array(eventSourceObservationSchema),
  status: eventLifecycleStatusSchema,
});
export type InferredEvent = z.infer<typeof inferredEventSchema>;

export const filterOptionsSchema = z.object({
  eventTypes: z.array(eventTypeSchema),
  airlines: z.array(airlineReferenceSchema),
  sourceStatus: sourceStatusSchema,
  generatedAt: z.string().datetime(),
});
export type FilterOptions = z.infer<typeof filterOptionsSchema>;

export const eventPageSchema = z.object({
  items: z.array(inferredEventSchema),
  sourceStatus: sourceStatusSchema,
  generatedAt: z.string().datetime(),
  nextCursor: z.string().nullable(),
});
export type EventPage = z.infer<typeof eventPageSchema>;

function hasUniqueItems(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const uniqueAirportIcaosSchema = z
  .array(airportIcaoSchema)
  .max(100)
  .refine(hasUniqueItems, { message: 'airportIcaos must not contain duplicates.' });

const uniqueAirlineIdsSchema = z
  .array(airlineIdSchema)
  .max(100)
  .refine(hasUniqueItems, { message: 'airlineIds must not contain duplicates.' });

const uniqueEventTypesSchema = z
  .array(eventTypeSchema)
  .max(3)
  .refine(hasUniqueItems, { message: 'eventTypes must not contain duplicates.' });

export const preferenceUpdateSchema = z
  .object({
    airportIcaos: uniqueAirportIcaosSchema,
    airlineIds: uniqueAirlineIdsSchema,
    eventTypes: uniqueEventTypesSchema,
    notificationsEnabled: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.notificationsEnabled) {
      if (value.airportIcaos.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['airportIcaos'],
          message: 'At least one airport must be selected before enabling notifications.',
        });
      }

      if (value.eventTypes.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventTypes'],
          message: 'At least one event type must be selected before enabling notifications.',
        });
      }
    }
  });
export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;

export const preferenceSnapshotSchema = z
  .object({
    airportIcaos: uniqueAirportIcaosSchema,
    airlineIds: uniqueAirlineIdsSchema,
    eventTypes: uniqueEventTypesSchema,
    notificationsEnabled: z.boolean(),
    revision: z.number().int().min(0),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PreferenceSnapshot = z.infer<typeof preferenceSnapshotSchema>;

export const androidPushSubscriptionSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
export type AndroidPushSubscription = z.infer<typeof androidPushSubscriptionSchema>;

export const webPushSubscriptionSchema = z
  .object({
    endpoint: z.string().url(),
    keys: z
      .object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type WebPushSubscription = z.infer<typeof webPushSubscriptionSchema>;

export const pushSubscriptionInputSchema = z.discriminatedUnion('platform', [
  z
    .object({
      platform: z.literal('android'),
      subscription: androidPushSubscriptionSchema,
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      platform: z.literal('web'),
      subscription: webPushSubscriptionSchema,
      consent: z.literal(true),
    })
    .strict(),
]);
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
