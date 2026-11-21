import type {
  ClassificationStatus,
  EventSourceObservation,
  EventType,
} from '@flight-on-time/contracts';

export interface AlertPushPayload {
  eventId: string;
  airportIcao: string;
  eventType: EventType;
  classificationStatus: ClassificationStatus;
  inferredNotice: string;
  airlineName: string;
  observedAt: string;
  sources: readonly EventSourceObservation[];
}

export type PushDeliveryOutcome = { status: 'sent' | 'failed' | 'invalid_token' };

export interface AndroidPushSubscriptionSecret {
  token: string;
}

export interface AndroidPushProvider {
  send(
    subscription: AndroidPushSubscriptionSecret,
    payload: AlertPushPayload,
  ): Promise<PushDeliveryOutcome>;
}

export class UnconfiguredAndroidPushProvider implements AndroidPushProvider {
  async send(): Promise<PushDeliveryOutcome> {
    return { status: 'failed' };
  }
}
