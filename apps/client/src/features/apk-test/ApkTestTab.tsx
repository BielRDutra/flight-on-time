import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface ApkTestSessionState {
  accountId: string;
  bearerToken: string | null;
  installationId: string | null;
  installationCredential: string | null;
  pushRegistered: boolean;
}

export interface ApkTestTabProps {
  apiBaseUrl: string;
  session: ApkTestSessionState;
  onSessionChanged: (next: ApkTestSessionState) => void;
  fetchImpl?: typeof fetch | undefined;
}

interface ExecutionLogEntry {
  id: number;
  message: string;
}

export function ApkTestTab({
  apiBaseUrl,
  session,
  onSessionChanged,
  fetchImpl = fetch,
}: ApkTestTabProps) {
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const [serverHealth, setServerHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isBusy, setIsBusy] = useState(false);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [{ id: Date.now() + current.length, message }, ...current].slice(0, 8));
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetchImpl(`${baseUrl}/health/live`);
      setServerHealth(response.ok ? 'online' : 'offline');
    } catch {
      setServerHealth('offline');
    }
  }, [baseUrl, fetchImpl]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/health/live`);
        if (active) {
          setServerHealth(response.ok ? 'online' : 'offline');
        }
      } catch {
        if (active) {
          setServerHealth('offline');
        }
      }
    });

    return () => {
      active = false;
    };
  }, [baseUrl, fetchImpl]);

  async function handleSimulateAndroidSignIn(): Promise<void> {
    setIsBusy(true);
    try {
      const challengeRes = await fetchImpl(`${baseUrl}/v1/auth/google/challenge?platform=android`);
      if (!challengeRes.ok) {
        appendLog(`Falha ao gerar desafio Android (${challengeRes.status}).`);
        return;
      }

      const challenge = (await challengeRes.json()) as { challengeId: string; nonce: string };
      const sessionRes = await fetchImpl(`${baseUrl}/v1/auth/google/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          credential: `dev-apk-token:${session.accountId}:${challenge.nonce}`,
        }),
      });

      if (!sessionRes.ok) {
        appendLog(`Falha ao trocar token no backend (${sessionRes.status}).`);
        return;
      }

      const issued = (await sessionRes.json()) as { sessionToken: string };
      onSessionChanged({
        ...session,
        bearerToken: issued.sessionToken,
      });
      appendLog('Login Android APK simulado (201 Created): sessão opaca emitida.');
    } catch {
      appendLog('Erro de rede ao simular login Android no APK.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRegisterAndClaimInstallation(): Promise<void> {
    if (!session.bearerToken) {
      appendLog('Execute o passo 1 (Login Android) antes de vincular a instalação.');
      return;
    }

    setIsBusy(true);
    try {
      const registerRes = await fetchImpl(`${baseUrl}/v1/installations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: 'android' }),
      });

      if (!registerRes.ok) {
        appendLog(`Falha ao registrar instalação Android (${registerRes.status}).`);
        return;
      }

      const created = (await registerRes.json()) as {
        installationId: string;
        androidCredential: string;
      };

      const claimRes = await fetchImpl(
        `${baseUrl}/v1/me/installations/${encodeURIComponent(created.installationId)}/claim`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${session.bearerToken}`,
            'x-installation-authorization': `Bearer ${created.androidCredential}`,
          },
        },
      );

      if (!claimRes.ok) {
        appendLog(`Falha ao vincular instalação à conta (${claimRes.status}).`);
        return;
      }

      onSessionChanged({
        ...session,
        installationId: created.installationId,
        installationCredential: created.androidCredential,
      });
      appendLog(`Instalação APK registrada e vinculada (${created.installationId}).`);
    } catch {
      appendLog('Erro de rede ao registrar/vincular instalação APK.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRegisterPushSubscription(): Promise<void> {
    if (!session.bearerToken || !session.installationId || !session.installationCredential) {
      appendLog('Execute os passos 1 e 2 antes de testar a assinatura push.');
      return;
    }

    setIsBusy(true);
    try {
      const subRes = await fetchImpl(
        `${baseUrl}/v1/me/installations/${encodeURIComponent(session.installationId)}/push-subscription`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.bearerToken}`,
            'x-installation-authorization': `Bearer ${session.installationCredential}`,
          },
          body: JSON.stringify({
            platform: 'android',
            subscription: { token: 'apk-local-fcm-token-demo' },
            consent: true,
          }),
        },
      );

      if (!subRes.ok) {
        appendLog(`Falha ao registrar assinatura push (${subRes.status}).`);
        return;
      }

      onSessionChanged({
        ...session,
        pushRegistered: true,
      });
      appendLog('Assinatura push FCM salva e cifrada com AES-256-GCM no SQLite (204).');
    } catch {
      appendLog('Erro de rede ao registrar assinatura push APK.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOutApk(): Promise<void> {
    setIsBusy(true);
    try {
      if (session.bearerToken && session.installationId && session.installationCredential) {
        await fetchImpl(
          `${baseUrl}/v1/me/installations/${encodeURIComponent(session.installationId)}/claim`,
          {
            method: 'DELETE',
            headers: {
              authorization: `Bearer ${session.bearerToken}`,
              'x-installation-authorization': `Bearer ${session.installationCredential}`,
            },
          },
        );
      }

      if (session.bearerToken) {
        await fetchImpl(`${baseUrl}/v1/me/session`, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${session.bearerToken}`,
          },
        });
      }

      onSessionChanged({
        accountId: session.accountId,
        bearerToken: null,
        installationId: null,
        installationCredential: null,
        pushRegistered: false,
      });
      appendLog('Instalação desvinculada e sessão APK revogada (204).');
    } catch {
      appendLog('Erro ao encerrar sessão APK.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Aba de APK para Teste (Android)
      </Text>
      <Text style={styles.subtitle}>
        Ambiente local para simular e validar todo o fluxo do APK Android sem depender de OAuth em
        produção.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.cardHeading}>Status do Servidor Local</Text>
        <Text
          style={[
            styles.healthText,
            serverHealth === 'online' ? styles.healthOnline : styles.healthOffline,
          ]}
        >
          {serverHealth === 'online'
            ? `Backend local online (${baseUrl})`
            : serverHealth === 'offline'
              ? `Backend local offline (${baseUrl})`
              : `Verificando backend (${baseUrl})...`}
        </Text>
        <Pressable
          accessibilityLabel="Verificar servidor local"
          accessibilityRole="button"
          onPress={() => void checkHealth()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Verificar servidor</Text>
        </Pressable>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.cardHeading}>Estado da Sessão do APK</Text>
        <Text style={styles.metaText}>
          {session.bearerToken
            ? `Sessão Android ativa (conta ${session.accountId})`
            : 'Nenhuma sessão APK ativa.'}
        </Text>
        <Text style={styles.metaText}>
          Instalação: {session.installationId ?? 'Não registrada'}
        </Text>
        <Text style={styles.metaText}>
          {session.pushRegistered
            ? 'Push FCM criptografado no servidor: Ativo'
            : 'Push FCM: Não registrado'}
        </Text>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.cardHeading}>Simulador de Fluxo do APK</Text>
        <Pressable
          accessibilityLabel="Simular login Android no APK"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleSimulateAndroidSignIn()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>1. Simular Login Android no APK</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Registrar e vincular instalação APK"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleRegisterAndClaimInstallation()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>2. Registrar e Vincular Instalação APK</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Registrar assinatura push APK"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleRegisterPushSubscription()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>3. Testar Assinatura Push FCM (AES-256-GCM)</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Encerrar sessão do APK"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleSignOutApk()}
          style={styles.dangerButton}
        >
          <Text style={styles.dangerButtonText}>4. Encerrar Sessão do APK (Unlink + Revoke)</Text>
        </Pressable>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.cardHeading}>Log de Execução do APK</Text>
        {logs.length === 0 ? (
          <Text style={styles.metaText}>Nenhuma ação executada ainda.</Text>
        ) : (
          logs.map((entry) => (
            <Text key={entry.id} style={styles.logItem}>
              • {entry.message}
            </Text>
          ))
        )}
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.cardHeading}>Configuração e Build do APK Android</Text>
        <Text style={styles.metaText}>Package ID: com.flightontime.app · Scheme: flightontime://</Text>
        <Text style={styles.codeBlock}>npx expo run:android</Text>
        <Text style={styles.codeBlock}>cd android && ./gradlew assembleDebug</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  title: {
    color: '#172c29',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475c58',
    fontSize: 14,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  actionsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e3e0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardHeading: {
    color: '#172c29',
    fontSize: 15,
    fontWeight: '700',
  },
  healthText: {
    fontSize: 14,
    fontWeight: '600',
  },
  healthOnline: {
    color: '#24534c',
  },
  healthOffline: {
    color: '#a43d33',
  },
  metaText: {
    color: '#475c58',
    fontSize: 13,
  },
  logItem: {
    color: '#2b403c',
    fontSize: 13,
    lineHeight: 18,
  },
  codeBlock: {
    backgroundColor: '#f2f6f5',
    borderRadius: 8,
    color: '#172c29',
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#24534c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3efec',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#24534c',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#fdf2f0',
    borderColor: '#e6b8b2',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  dangerButtonText: {
    color: '#a43d33',
    fontSize: 14,
    fontWeight: '700',
  },
});
