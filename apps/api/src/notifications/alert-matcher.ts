import type {
  InferredEvent,
  PreferenceSnapshot,
  SourceStatus,
} from '@flight-on-time/contracts';

const DEFAULT_MIN_ALERT_CONFIDENCE = 0.5;

export interface MatchEvaluationOptions {
  minConfidence?: number | undefined;
}

export function isEventEligibleForPreferences(
  event: InferredEvent,
  preferences: PreferenceSnapshot,
  sourceStatus: SourceStatus,
  options: MatchEvaluationOptions = {},
): boolean {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_ALERT_CONFIDENCE;

  if (sourceStatus !== 'current' || event.status !== 'current') {
    return false;
  }

  if (event.confidence < minConfidence) {
    return false;
  }

  if (!preferences.notificationsEnabled) {
    return false;
  }

  if (preferences.airportIcaos.length === 0 || preferences.eventTypes.length === 0) {
    return false;
  }

  if (!preferences.airportIcaos.includes(event.airportIcao)) {
    return false;
  }

  if (!preferences.eventTypes.includes(event.eventType)) {
    return false;
  }

  if (preferences.airlineIds.length > 0) {
    if (!event.airline || !preferences.airlineIds.includes(event.airline.airlineId)) {
      return false;
    }
  }

  return true;
}
