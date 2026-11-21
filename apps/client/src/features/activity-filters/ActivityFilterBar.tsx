import type { AirlineReference, EventType } from '@flight-on-time/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActivityFilterFacet, ActivityFilterSelection } from './use-filtered-events.js';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  go_around: 'Arremetida',
  holding_or_orbit: 'Órbita / espera',
  diversion_candidate: 'Alternado candidato',
};

export interface ActivityFilterBarProps {
  availableAirports: readonly string[];
  availableAirlines: readonly AirlineReference[];
  availableEventTypes: readonly EventType[];
  selection: ActivityFilterSelection;
  onToggleAirport: (airportIcao: string) => void;
  onToggleAirline: (airlineId: string) => void;
  onToggleEventType: (eventType: EventType) => void;
  onClearFacet: (facet: ActivityFilterFacet) => void;
  onClearAll: () => void;
}

export function ActivityFilterBar({
  availableAirports,
  availableAirlines,
  availableEventTypes,
  selection,
  onToggleAirport,
  onToggleAirline,
  onToggleEventType,
  onClearFacet,
  onClearAll,
}: ActivityFilterBarProps) {
  const hasAnySelection =
    selection.airportIcaos.length > 0 ||
    selection.airlineIds.length > 0 ||
    selection.eventTypes.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Filtros de atividade</Text>
        {hasAnySelection && (
          <Pressable
            accessibilityLabel="Limpar todos os filtros"
            accessibilityRole="button"
            onPress={onClearAll}
            style={styles.clearAllButton}
          >
            <Text style={styles.clearAllText}>Limpar todos</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.facetGroup}>
        <View style={styles.facetHeader}>
          <Text style={styles.facetLabel}>Aeroportos</Text>
          {selection.airportIcaos.length > 0 && (
            <Pressable
              accessibilityLabel="Limpar filtro de aeroportos"
              accessibilityRole="button"
              onPress={() => onClearFacet('airportIcaos')}
            >
              <Text style={styles.clearFacetText}>Limpar</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.chipRow}>
          {availableAirports.map((airportIcao) => {
            const selected = selection.airportIcaos.includes(airportIcao);
            return (
              <Pressable
                key={airportIcao}
                accessibilityLabel={`Filtrar aeroporto ${airportIcao}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggleAirport(airportIcao)}
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

      <View style={styles.facetGroup}>
        <View style={styles.facetHeader}>
          <Text style={styles.facetLabel}>Companhias aéreas verificadas</Text>
          {selection.airlineIds.length > 0 && (
            <Pressable
              accessibilityLabel="Limpar filtro de companhias"
              accessibilityRole="button"
              onPress={() => onClearFacet('airlineIds')}
            >
              <Text style={styles.clearFacetText}>Limpar</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.chipRow}>
          {availableAirlines.length === 0 ? (
            <Text style={styles.emptyFacetHint}>
              Nenhuma companhia verificada disponível para os aeroportos selecionados.
            </Text>
          ) : (
            availableAirlines.map((airline) => {
              const selected = selection.airlineIds.includes(airline.airlineId);
              return (
                <Pressable
                  key={airline.airlineId}
                  accessibilityLabel={`Filtrar companhia ${airline.displayName}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onToggleAirline(airline.airlineId)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {airline.displayName}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </View>

      <View style={styles.facetGroup}>
        <View style={styles.facetHeader}>
          <Text style={styles.facetLabel}>Tipos de aviso</Text>
          {selection.eventTypes.length > 0 && (
            <Pressable
              accessibilityLabel="Limpar filtro de categorias"
              accessibilityRole="button"
              onPress={() => onClearFacet('eventTypes')}
            >
              <Text style={styles.clearFacetText}>Limpar</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.chipRow}>
          {availableEventTypes.map((eventType) => {
            const selected = selection.eventTypes.includes(eventType);
            const label = EVENT_TYPE_LABELS[eventType];
            return (
              <Pressable
                key={eventType}
                accessibilityLabel={`Filtrar categoria ${label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggleEventType(eventType)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {
    color: '#172c29',
    fontSize: 18,
    fontWeight: '700',
  },
  clearAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearAllText: {
    color: '#24534c',
    fontSize: 13,
    fontWeight: '600',
  },
  facetGroup: {
    gap: 8,
  },
  facetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  facetLabel: {
    color: '#475c58',
    fontSize: 13,
    fontWeight: '600',
  },
  clearFacetText: {
    color: '#52756d',
    fontSize: 12,
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
  emptyFacetHint: {
    color: '#6b7e79',
    fontSize: 12,
  },
});
