import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PreferenceSyncState } from '../../storage/preference-cache';
import type { ConflictResolutionStrategy } from './preference-sync';

export interface PreferenceSyncStatusProps {
  syncState: PreferenceSyncState;
  revision: number;
  onResolveConflict?: (strategy: ConflictResolutionStrategy) => void;
}

export function PreferenceSyncStatus({
  syncState,
  revision,
  onResolveConflict,
}: PreferenceSyncStatusProps) {
  return (
    <View style={[styles.container, syncState === 'conflict' && styles.conflictContainer]}>
      <Text
        accessibilityRole={syncState === 'failed' || syncState === 'conflict' ? 'alert' : 'text'}
        style={[
          styles.statusText,
          syncState === 'failed' && styles.errorText,
          syncState === 'conflict' && styles.conflictText,
        ]}
      >
        {syncState === 'synced' && `Preferências sincronizadas (revisão ${revision}).`}
        {syncState === 'pending' &&
          'Alteração pendente de sincronização. Ainda não confirmada no servidor.'}
        {syncState === 'failed' &&
          'Falha ao salvar preferências no servidor. As alterações não foram confirmadas.'}
        {syncState === 'conflict' &&
          'Conflito de revisão detectado: outra sessão atualizou suas preferências.'}
      </Text>

      {syncState === 'conflict' && onResolveConflict && (
        <View style={styles.conflictActions}>
          <Pressable
            accessibilityLabel="Manter versão do servidor"
            accessibilityRole="button"
            onPress={() => onResolveConflict('keep_server')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Manter versão do servidor</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Reenviar minhas alterações"
            accessibilityRole="button"
            onPress={() => onResolveConflict('retry_local')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Reenviar minhas alterações</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f2f6f5',
    borderColor: '#d0ddd9',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  conflictContainer: {
    backgroundColor: '#fdf4e7',
    borderColor: '#e7c694',
  },
  statusText: {
    color: '#2b403c',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#a43d33',
  },
  conflictText: {
    color: '#6e4714',
  },
  conflictActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#c5d4d0',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#2b403c',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#24534c',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
