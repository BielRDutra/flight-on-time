import type { EventType, InferredEvent, SourceStatus } from '@flight-on-time/contracts';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  go_around: 'Arremetida',
  holding_or_orbit: 'Órbita / espera',
  diversion_candidate: 'Alternado candidato',
};

export interface ActivityResultsStateProps {
  events: readonly InferredEvent[];
  isLoading: boolean;
  sourceStatus: SourceStatus;
  generatedAt: string | null;
  errorMessage: string | null;
  onClearFilters: () => void;
}

export function ActivityResultsState({
  events,
  isLoading,
  sourceStatus,
  generatedAt,
  errorMessage,
  onClearFilters,
}: ActivityResultsStateProps) {
  return (
    <View style={styles.container}>
      {sourceStatus !== 'current' && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerText}>
            {sourceStatus === 'stale'
              ? 'Dados desatualizados: a fonte não foi atualizada recentemente.'
              : sourceStatus === 'limited'
                ? 'Cobertura limitada: algumas operadoras ou aeroportos podem estar ausentes.'
                : 'Fonte indisponível: não é possível confirmar eventos recentes.'}
          </Text>
          {generatedAt && <Text style={styles.timestampText}>Gerado em: {generatedAt}</Text>}
        </View>
      )}

      {isLoading && (
        <View style={styles.stateCard}>
          <ActivityIndicator accessibilityLabel="Carregando eventos" color="#24534c" />
          <Text style={styles.stateText}>Carregando eventos...</Text>
        </View>
      )}

      {!isLoading && errorMessage && (
        <View style={styles.stateCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      )}

      {!isLoading && !errorMessage && events.length === 0 && (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>
            Nenhum evento encontrado para os filtros selecionados.
          </Text>
          <Pressable
            accessibilityLabel="Limpar filtros"
            accessibilityRole="button"
            onPress={onClearFilters}
            style={styles.resetButton}
          >
            <Text style={styles.resetButtonText}>Limpar filtros</Text>
          </Pressable>
        </View>
      )}

      {!isLoading &&
        !errorMessage &&
        events.map((event) => {
          const sourceNames = event.sources.map((source) => source.id).join(', ');
          return (
            <View key={event.eventId} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>
                  {event.airportIcao} · {EVENT_TYPE_LABELS[event.eventType]}
                </Text>
                <Text style={styles.badge}>
                  {event.classificationStatus === 'inferred'
                    ? 'Classificação inferida'
                    : 'Reportada diretamente'}
                </Text>
              </View>
              <Text style={styles.airlineText}>
                {event.airline ? event.airline.displayName : 'Companhia desconhecida'}
              </Text>
              <Text style={styles.metaText}>
                Observado em: {event.lastObservedAt} · Fontes: {sourceNames}
              </Text>
            </View>
          );
        })}

      <Text style={styles.disclaimer}>
        Condições meteorológicas são apresentadas apenas como contexto informativo, sem atribuir
        causa à manobra. Produto informativo, não operacional.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  statusBanner: {
    backgroundColor: '#fdf4e7',
    borderColor: '#e7c694',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  statusBannerText: {
    color: '#6e4714',
    fontSize: 13,
    fontWeight: '600',
  },
  timestampText: {
    color: '#7c5c2d',
    fontSize: 12,
    marginTop: 4,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  stateText: {
    color: '#475c58',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#a43d33',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#e3efec',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resetButtonText: {
    color: '#24534c',
    fontSize: 13,
    fontWeight: '700',
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  eventHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventTitle: {
    color: '#172c29',
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    color: '#52756d',
    fontSize: 12,
    fontWeight: '600',
  },
  airlineText: {
    color: '#2b403c',
    fontSize: 14,
    fontWeight: '600',
  },
  metaText: {
    color: '#6b7e79',
    fontSize: 12,
  },
  disclaimer: {
    color: '#6b7e79',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center',
  },
});
