import { useEffect, useState } from 'react';
import type { EventType } from '@flight-on-time/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createExpoAndroidNotificationAdapter,
  disableInstallationPushSubscription,
  registerAndroidPushSubscription,
  type AndroidNotificationAdapter,
  type DeviceNotificationPermissionStatus,
} from '../../platform/notifications/android-push.js';
import {
  createBrowserWebPushAdapter,
  registerWebPushSubscription,
  type WebPushAdapter,
} from '../../platform/notifications/web-push.js';

export interface NotificationSettingsScreenProps {
  platform: 'android' | 'web';
  apiBaseUrl: string;
  installationId: string;
  accountBearerToken?: string | undefined;
  installationCredential?: string | undefined;
  vapidPublicKey?: string | undefined;
  selectedAirports: readonly string[];
  selectedEventTypes: readonly EventType[];
  notificationsEnabled: boolean;
  androidAdapter?: AndroidNotificationAdapter | undefined;
  webPushAdapter?: WebPushAdapter | undefined;
  fetchImpl?: typeof fetch | undefined;
  onEnableNotifications: () => Promise<boolean>;
  onDisableNotifications: () => Promise<void>;
}

export function NotificationSettingsScreen(props: NotificationSettingsScreenProps) {
  const [enabledOverride, setEnabledOverride] = useState<{
    base: boolean;
    value: boolean;
  } | null>(null);
  const enabled =
    enabledOverride && enabledOverride.base === props.notificationsEnabled
      ? enabledOverride.value
      : props.notificationsEnabled;
  const [permission, setPermission] = useState<DeviceNotificationPermissionStatus>('undetermined');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const adapter =
      props.platform === 'android'
        ? (props.androidAdapter ?? createExpoAndroidNotificationAdapter())
        : (props.webPushAdapter ?? createBrowserWebPushAdapter());

    void adapter.getPermissionStatus().then((status) => {
      if (active) {
        setPermission(status);
      }
    });

    return () => {
      active = false;
    };
  }, [props.androidAdapter, props.platform, props.webPushAdapter]);

  async function handleEnable(): Promise<void> {
    if (props.selectedAirports.length === 0 || props.selectedEventTypes.length === 0) {
      setFeedback(
        'Selecione ao menos um aeroporto e uma categoria antes de ativar os avisos.',
      );
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      if (props.platform === 'android') {
        if (!props.accountBearerToken || !props.installationCredential) {
          setFeedback('Credenciais da instalação não disponíveis neste dispositivo.');
          setIsBusy(false);
          return;
        }

        const result = await registerAndroidPushSubscription({
          apiBaseUrl: props.apiBaseUrl,
          installationId: props.installationId,
          accountBearerToken: props.accountBearerToken,
          installationCredential: props.installationCredential,
          adapter: props.androidAdapter,
          fetchImpl: props.fetchImpl,
        });

        if (result.status !== 'registered') {
          setPermission('denied');
          setFeedback('Permissão de notificações negada neste dispositivo.');
          setIsBusy(false);
          return;
        }
      } else {
        const result = await registerWebPushSubscription({
          apiBaseUrl: props.apiBaseUrl,
          installationId: props.installationId,
          vapidPublicKey: props.vapidPublicKey ?? '',
          adapter: props.webPushAdapter,
          fetchImpl: props.fetchImpl,
        });

        if (result.status === 'unsupported') {
          setPermission('unsupported');
          setFeedback('Este navegador não oferece suporte a notificações push.');
          setIsBusy(false);
          return;
        }

        if (result.status !== 'registered') {
          setPermission('denied');
          setFeedback('Permissão de notificações negada neste dispositivo.');
          setIsBusy(false);
          return;
        }
      }

      const saved = await props.onEnableNotifications();
      if (saved) {
        setPermission('granted');
        setEnabledOverride({ base: props.notificationsEnabled, value: true });
        setFeedback('Avisos ativados para este dispositivo.');
      } else {
        setFeedback('Não foi possível confirmar a ativação dos avisos na sua conta.');
      }
    } catch {
      setFeedback('Erro ao configurar notificações. Tente novamente.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisable(): Promise<void> {
    setIsBusy(true);
    setFeedback(null);

    try {
      await disableInstallationPushSubscription({
        apiBaseUrl: props.apiBaseUrl,
        installationId: props.installationId,
        platform: props.platform,
        accountBearerToken: props.accountBearerToken,
        installationCredential: props.installationCredential,
        fetchImpl: props.fetchImpl,
      });
      await props.onDisableNotifications();
      setEnabledOverride({ base: props.notificationsEnabled, value: false });
      setFeedback('Avisos desativados para este dispositivo.');
    } catch {
      setFeedback('Não foi possível desativar os avisos agora.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Avisos personalizados
      </Text>

      <Text style={styles.statusText}>
        {enabled && permission === 'granted'
          ? 'Avisos ativados neste dispositivo.'
          : permission === 'denied'
            ? 'Avisos desativados: permissão negada neste dispositivo.'
            : 'Avisos desativados por padrão.'}
      </Text>

      {feedback && (
        <Text accessibilityRole="alert" style={styles.feedbackText}>
          {feedback}
        </Text>
      )}

      {!enabled ? (
        <Pressable
          accessibilityLabel="Ativar avisos personalizados"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleEnable()}
          style={styles.enableButton}
        >
          <Text style={styles.enableButtonText}>
            {isBusy ? 'Configurando...' : 'Ativar avisos'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Desativar avisos personalizados"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleDisable()}
          style={styles.disableButton}
        >
          <Text style={styles.disableButtonText}>
            {isBusy ? 'Desativando...' : 'Desativar avisos'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.disclaimer}>
        Avisos são informativos e podem conter classificações inferidas. Não orientam decisões
        operacionais de voo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  title: {
    color: '#172c29',
    fontSize: 18,
    fontWeight: '700',
  },
  statusText: {
    color: '#475c58',
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackText: {
    color: '#a43d33',
    fontSize: 13,
    fontWeight: '600',
  },
  enableButton: {
    alignItems: 'center',
    backgroundColor: '#24534c',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  enableButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disableButton: {
    alignItems: 'center',
    backgroundColor: '#f2f6f5',
    borderColor: '#c5d4d0',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  disableButtonText: {
    color: '#2b403c',
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimer: {
    color: '#6b7e79',
    fontSize: 12,
    lineHeight: 18,
  },
});
