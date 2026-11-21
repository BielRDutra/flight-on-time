import type { AlertPushPayload, PushDeliveryOutcome } from './android-push-provider.js';

export interface WebPushSubscriptionSecret {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushProvider {
  send(
    subscription: WebPushSubscriptionSecret,
    payload: AlertPushPayload,
  ): Promise<PushDeliveryOutcome>;
}

export class UnconfiguredWebPushProvider implements WebPushProvider {
  async send(): Promise<PushDeliveryOutcome> {
    return { status: 'failed' };
  }
}
