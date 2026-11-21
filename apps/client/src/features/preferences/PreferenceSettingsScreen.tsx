import { useEffect, useState } from 'react';
import {
  EVENT_TYPES,
  type AirlineReference,
  type EventType,
  type PreferenceUpdate,
} from '@flight-on-time/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PreferenceSyncState } from '../../storage/preference-cache';
import type { ConflictResolutionStrategy, PreferenceSyncCoordinator } from './preference-sync';
import { PreferenceSyncStatus } from './PreferenceSyncStatus';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  go_around: 'Arremetida',
  holding_or_orbit: 'Órbita / espera',
  diversion_candidate: 'Alternado candidato',
};

export interface PreferenceSettingsScreenProps {
  accountId: string;
  availableAirports: readonly string[];
  availableAirlines: readonly AirlineReference[];
  coordinator: PreferenceSyncCoordinator;
}

function toggleItem<T extends string>(items: readonly T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function PreferenceSettingsScreen({
  accountId,
  availableAirports,
  availableAirlines,
  coordinator,
}: PreferenceSettingsScreenProps) {
  const [draft, setDraft] = useState<PreferenceUpdate>({
    airportIcaos: [],
    airlineIds: [],
    eventTypes: [],
    notificationsEnabled: false,
  });
  const [revision, setRevision] = useState(0);
  const [syncState, setSyncState] = useState<PreferenceSyncState>('synced');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.resolve()
      .then(async () => {
        if (!active) {
          return;
        }
        setIsLoading(true);
        const state = await coordinator.restore(accountId);
        if (!active) {
          return;
        }

        const activeValues = state.pendingUpdate ?? state.snapshot;
        setDraft({
          airportIcaos: activeValues.airportIcaos,
          airlineIds: activeValues.airlineIds,
          eventTypes: activeValues.eventTypes,
          notificationsEnabled: activeValues.notificationsEnabled,
        });
        setRevision(state.snapshot.revision);
        setSyncState(state.syncState);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountId, coordinator]);

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    const nextState = await coordinator.save(accountId, draft);
    setRevision(nextState.snapshot.revision);
    setSyncState(nextState.syncState);
    setIsSaving(false);
  }

  async function handleResolveConflict(strategy: ConflictResolutionStrategy): Promise<void> {
    setIsSaving(true);
    const resolved = await coordinator.resolveConflict(accountId, strategy);
    const activeValues = resolved.pendingUpdate ?? resolved.snapshot;
    setDraft({
      airportIcaos: activeValues.airportIcaos,
      airlineIds: activeValues.airlineIds,
      eventTypes: activeValues.eventTypes,
      notificationsEnabled: activeValues.notificationsEnabled,
    });
    setRevision(resolved.snapshot.revision);
    setSyncState(resolved.syncState);
    setIsSaving(false);
  }

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Preferências da conta
      </Text>

      {isLoading ? (
        <Text style={styles.loadingText}>Carregando preferências salvas...</Text>
      ) : (
        <>
          <PreferenceSyncStatus
            revision={revision}
            syncState={syncState}
            onResolveConflict={(strategy) => void handleResolveConflict(strategy)}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Aeroportos de interesse</Text>
            <View style={styles.chipRow}>
              {availableAirports.map((airportIcao) => {
                const selected = draft.airportIcaos.includes(airportIcao);
                return (
                  <Pressable
                    key={airportIcao}
                    accessibilityLabel={`Preferência aeroporto ${airportIcao}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        airportIcaos: toggleItem(current.airportIcaos, airportIcao),
                      }))
                    }
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {airportIcao}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Companhias aéreas verificadas</Text>
            <View style={styles.chipRow}>
              {availableAirlines.map((airline) => {
                const selected = draft.airlineIds.includes(airline.airlineId);
                return (
                  <Pressable
                    key={airline.airlineId}
                    accessibilityLabel={`Preferência companhia ${airline.displayName}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        airlineIds: toggleItem(current.airlineIds, airline.airlineId),
                      }))
                    }
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {airline.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Categorias de aviso</Text>
            <View style={styles.chipRow}>
              {EVENT_TYPES.map((eventType) => {
                const selected = draft.eventTypes.includes(eventType);
                const label = EVENT_TYPE_LABELS[eventType];
                return (
                  <Pressable
                    key={eventType}
                    accessibilityLabel={`Preferência categoria ${label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        eventTypes: toggleItem(current.eventTypes, eventType),
                      }))
                    }
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityLabel="Salvar preferências"
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => void handleSave()}
            style={styles.saveButton}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Salvando...' : 'Salvar preferências'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    padding: 16,
  },
  title: {
    color: '#172c29',
    fontSize: 22,
    fontWeight: '700',
  },
  loadingText: {
    color: '#5d706c',
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: '#475c58',
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#f2f6f5',
    borderColor: '#d0ddd9',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: '#24534c',
    borderColor: '#24534c',
  },
  chipText: {
    color: '#2b403c',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#24534c',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
