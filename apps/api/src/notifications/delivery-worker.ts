import {
  androidPushSubscriptionSchema,
  webPushSubscriptionSchema,
  type InferredEvent,
  type SourceStatus,
} from '@flight-on-time/contracts';
import { isEventEligibleForPreferences } from './alert-matcher.js';
import type { SqliteNotificationRepository } from './notification-repository.js';
import type { AlertPushPayload, AndroidPushProvider } from './providers/android-push-provider.js';
import type { WebPushProvider } from './providers/web-push-provider.js';

export interface DeliveryWorkerBatchResult {
  sentCount: number;
  failedCount: number;
  invalidatedCount: number;
  deduplicatedCount: number;
}

export interface AlertDeliveryWorkerOptions {
  repository: SqliteNotificationRepository;
  androidProvider: AndroidPushProvider;
  webProvider: WebPushProvider;
  now?: () => Date;
  minConfidence?: number;
}

export class AlertDeliveryWorker {
  private readonly now: () => Date;
  private readonly minConfidence?: number | undefined;

  constructor(private readonly options: AlertDeliveryWorkerOptions) {
    this.now = options.now ?? (() => new Date());
    this.minConfidence = options.minConfidence;
  }

  async processEvents(
    events: readonly InferredEvent[],
    sourceStatus: SourceStatus,
  ): Promise<DeliveryWorkerBatchResult> {
    const result: DeliveryWorkerBatchResult = {
      sentCount: 0,
      failedCount: 0,
      invalidatedCount: 0,
      deduplicatedCount: 0,
    };

    if (sourceStatus !== 'current' || events.length === 0) {
      return result;
    }

    const targets = this.options.repository.listEligibleAlertTargets();
    if (targets.length === 0) {
      return result;
    }

    for (const event of events) {
      for (const target of targets) {
        const eligible = isEventEligibleForPreferences(
          event,
          target.preferences,
          sourceStatus,
          this.minConfidence !== undefined ? { minConfidence: this.minConfidence } : {},
        );
        if (!eligible) {
          continue;
        }

        const attemptTimestamp = this.now().toISOString();
        const claimed = this.options.repository.claimDeliverySlot({
          eventId: event.eventId,
          accountId: target.accountId,
          installationId: target.installationId,
          sentAt: attemptTimestamp,
        });

        if (!claimed) {
          result.deduplicatedCount += 1;
          continue;
        }

        const payload = buildPushPayload(event);
        const secretJson = this.options.repository.decryptSubscriptionSecret(
          target.endpointOrTokenCiphertext,
        );

        let outcomeStatus: 'sent' | 'failed' | 'invalid_token' = 'failed';
        try {
          if (target.platform === 'android') {
            const parsedSecret = androidPushSubscriptionSchema.parse(JSON.parse(secretJson));
            const outcome = await this.options.androidProvider.send(parsedSecret, payload);
            outcomeStatus = outcome.status;
          } else {
            const parsedSecret = webPushSubscriptionSchema.parse(JSON.parse(secretJson));
            const outcome = await this.options.webProvider.send(parsedSecret, payload);
            outcomeStatus = outcome.status;
          }
        } catch {
          outcomeStatus = 'failed';
        }

        const completedAt = this.now().toISOString();
        if (outcomeStatus === 'sent') {
          result.sentCount += 1;
        } else if (outcomeStatus === 'invalid_token') {
          result.invalidatedCount += 1;
          this.options.repository.updateDeliveryStatus({
            eventId: event.eventId,
            accountId: target.accountId,
            installationId: target.installationId,
            status: 'invalidated',
            updatedAt: completedAt,
          });
        } else {
          result.failedCount += 1;
          this.options.repository.updateDeliveryStatus({
            eventId: event.eventId,
            accountId: target.accountId,
            installationId: target.installationId,
            status: 'failed',
            updatedAt: completedAt,
          });
        }
      }
    }

    return result;
  }
}

function buildPushPayload(event: InferredEvent): AlertPushPayload {
  return {
    eventId: event.eventId,
    airportIcao: event.airportIcao,
    eventType: event.eventType,
    classificationStatus: event.classificationStatus,
    inferredNotice:
      event.classificationStatus === 'inferred'
        ? 'Classificação inferida a partir de observações disponíveis; não orienta operação.'
        : 'Classificação reportada diretamente pela fonte configurada.',
    airlineName: event.airline ? event.airline.displayName : 'Companhia desconhecida',
    observedAt: event.lastObservedAt,
    sources: event.sources,
  };
}
