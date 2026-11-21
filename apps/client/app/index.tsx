import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SignInScreen from './(auth)/sign-in';
import { ActivityFilterBar } from '../src/features/activity-filters/ActivityFilterBar';
import { ActivityResultsState } from '../src/features/activity-filters/ActivityResultsState';
import { useFilteredEvents } from '../src/features/activity-filters/use-filtered-events';
import { ApkTestTab, type ApkTestSessionState } from '../src/features/apk-test/ApkTestTab';
import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import { PreferenceSettingsScreen } from '../src/features/preferences/PreferenceSettingsScreen';
import { PreferenceSyncCoordinator } from '../src/features/preferences/preference-sync';
import {
  AccountPreferenceCache,
  createExpoPreferenceSqliteDriver,
  type ClientPreferenceSqliteDriver,
  type SqliteBindPrimitive,
} from '../src/storage/preference-cache';

type WorkspaceTabId = 'apk-test' | 'filters' | 'preferences' | 'notifications' | 'sign-in';

const TABS: readonly { id: WorkspaceTabId; label: string }[] = [
  { id: 'apk-test', label: 'APK para Teste' },
  { id: 'filters', label: 'Atividade & Filtros' },
  { id: 'preferences', label: 'Preferências' },
  { id: 'notifications', label: 'Avisos Push' },
  { id: 'sign-in', label: 'Login Google' },
];

const DEFAULT_AIRPORTS = ['SBBR', 'SBGR', 'SBSP', 'SBRJ'] as const;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

function createLazyPreferenceDriver(): ClientPreferenceSqliteDriver {
  let driverPromise: Promise<ClientPreferenceSqliteDriver> | undefined;
  const resolveDriver = () => {
    driverPromise ??= createExpoPreferenceSqliteDriver();
    return driverPromise;
  };

  return {
    async execAsync(source) {
      const driver = await resolveDriver();
      await driver.execAsync(source);
    },
    async getFirstAsync<T>(source: string, params: readonly SqliteBindPrimitive[] = []) {
      const driver = await resolveDriver();
      return driver.getFirstAsync<T>(source, params);
    },
    async runAsync(source, params: readonly SqliteBindPrimitive[] = []) {
      const driver = await resolveDriver();
      await driver.runAsync(source, params);
    },
  };
}

export default function HomeRoute() {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('apk-test');
  const [apkSession, setApkSession] = useState<ApkTestSessionState>({
    accountId: 'apk-tester-01',
    bearerToken: null,
    installationId: null,
    installationCredential: null,
    pushRegistered: false,
  });

  const filtered = useFilteredEvents({
    apiBaseUrl,
    ...(apkSession.bearerToken ? { bearerToken: apkSession.bearerToken } : {}),
  });

  const cache = useMemo(() => new AccountPreferenceCache(createLazyPreferenceDriver()), []);

  const coordinator = useMemo(
    () =>
      new PreferenceSyncCoordinator({
        apiBaseUrl,
        cache,
        ...(apkSession.bearerToken ? { bearerToken: apkSession.bearerToken } : {}),
      }),
    [apkSession.bearerToken, cache],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brandTitle}>Flight On Time</Text>
        <Text style={styles.brandSubtitle}>Monitor informativo e alertas personalizados</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityLabel={`Aba ${tab.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab.id)}
                  style={[styles.tabButton, selected && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'apk-test' && (
          <ApkTestTab
            apiBaseUrl={apiBaseUrl}
            onSessionChanged={setApkSession}
            session={apkSession}
          />
        )}

        {activeTab === 'filters' && (
          <View style={styles.sectionStack}>
            <ActivityFilterBar
              availableAirlines={filtered.airlines}
              availableAirports={DEFAULT_AIRPORTS}
              availableEventTypes={filtered.eventTypes}
              onClearAll={filtered.clearAllFilters}
              onClearFacet={filtered.clearFacet}
              onToggleAirline={filtered.toggleAirline}
              onToggleAirport={filtered.toggleAirport}
              onToggleEventType={filtered.toggleEventType}
              selection={filtered.selection}
            />
            <ActivityResultsState
              errorMessage={filtered.errorMessage}
              events={filtered.events}
              generatedAt={filtered.generatedAt}
              isLoading={filtered.isLoading}
              onClearFilters={filtered.clearAllFilters}
              sourceStatus={filtered.sourceStatus}
            />
          </View>
        )}

        {activeTab === 'preferences' && (
          <View style={styles.sectionStack}>
            {!apkSession.bearerToken && (
              <View style={styles.noticeBanner}>
                <Text style={styles.noticeText}>
                  Dica: simule o login na aba &ldquo;APK para Teste&rdquo; para sincronizar as
                  preferências com a API local.
                </Text>
              </View>
            )}
            <PreferenceSettingsScreen
              accountId={apkSession.accountId}
              availableAirlines={filtered.airlines}
              availableAirports={DEFAULT_AIRPORTS}
              coordinator={coordinator}
            />
          </View>
        )}

        {activeTab === 'notifications' && (
          <NotificationSettingsScreen
            accountBearerToken={apkSession.bearerToken ?? undefined}
            apiBaseUrl={apiBaseUrl}
            installationCredential={apkSession.installationCredential ?? undefined}
            installationId={apkSession.installationId ?? 'local-test-installation'}
            notificationsEnabled={apkSession.pushRegistered}
            onDisableNotifications={async () => {
              setApkSession((current) => ({ ...current, pushRegistered: false }));
            }}
            onEnableNotifications={async () => {
              setApkSession((current) => ({ ...current, pushRegistered: true }));
              return true;
            }}
            platform={Platform.OS === 'android' ? 'android' : 'web'}
            selectedAirports={DEFAULT_AIRPORTS}
            selectedEventTypes={filtered.eventTypes}
          />
        )}

        {activeTab === 'sign-in' && <SignInScreen />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#f2f6f5',
    flex: 1,
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#d8e3e0',
    borderBottomWidth: 1,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  brandTitle: {
    color: '#172c29',
    fontSize: 22,
    fontWeight: '700',
  },
  brandSubtitle: {
    color: '#52756d',
    fontSize: 13,
  },
  tabScroll: {
    marginTop: 8,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    backgroundColor: '#eef3f2',
    borderColor: '#d0ddd9',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: '#24534c',
    borderColor: '#24534c',
  },
  tabLabel: {
    color: '#2b403c',
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#ffffff',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 880,
    padding: 16,
    width: '100%',
  },
  sectionStack: {
    gap: 16,
  },
  noticeBanner: {
    backgroundColor: '#fdf4e7',
    borderColor: '#e7c694',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noticeText: {
    color: '#6e4714',
    fontSize: 13,
    fontWeight: '600',
  },
});
