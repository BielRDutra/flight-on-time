import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  beginWebGoogleSignIn,
  type WebGoogleSignInError,
} from '../../src/platform/auth/web-google';

type ScreenState = 'loading' | 'ready' | 'error' | 'cancelled' | 'signed-in';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const hasWebConfiguration = Boolean(apiBaseUrl && googleWebClientId);

export default function SignInScreen() {
  const [state, setState] = useState<ScreenState>(() =>
    Platform.OS === 'web' && hasWebConfiguration ? 'loading' : 'error',
  );
  const [message, setMessage] = useState(() => {
    if (Platform.OS !== 'web') {
      return 'O acesso Android ainda não foi configurado.';
    }

    return hasWebConfiguration
      ? 'Preparando o acesso seguro da sua conta.'
      : 'Configure a API e o cliente OAuth web para habilitar o acesso.';
  });
  const cancelRef = useRef<((notifyUser?: boolean) => void) | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    cancelRef.current = undefined;

    if (Platform.OS !== 'web' || !hasWebConfiguration) {
      return;
    }

    let disposed = false;
    let completed = false;

    void Promise.resolve()
      .then(async () => {
        if (disposed) {
          return;
        }

        const button = document.getElementById('google-sign-in-button');
        if (!button) {
          completed = true;
          setState('error');
          setMessage('Não foi possível preparar o botão de acesso.');
          return;
        }

        const cancel = await beginWebGoogleSignIn({
          apiBaseUrl,
          googleWebClientId,
          button,
          onSignedIn: () => {
            completed = true;
            setState('signed-in');
            setMessage('Acesso confirmado com segurança.');
          },
          onError: (error: WebGoogleSignInError) => {
            completed = true;
            setState('error');
            setMessage(error.message);
          },
          onCancelled: () => {
            completed = true;
            setState('cancelled');
            setMessage('Acesso cancelado. Você pode tentar novamente.');
          },
        });

        if (disposed) {
          cancel(false);
          return;
        }

        cancelRef.current = cancel;
        if (!completed) {
          setState('ready');
          setMessage('Entre para salvar suas preferências entre dispositivos.');
        }
      })
      .catch(() => {
        if (!disposed) {
          setState('error');
          setMessage('Não foi possível preparar o acesso. Tente novamente.');
        }
      });

    return () => {
      disposed = true;
      cancelRef.current?.(false);
      cancelRef.current = undefined;
    };
  }, [attempt]);

  function cancelSignIn(): void {
    cancelRef.current?.();
  }

  function retrySignIn(): void {
    setState('loading');
    setMessage('Preparando um novo acesso seguro.');
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>F</Text>
        </View>
        <Text style={styles.eyebrow}>FLIGHT ON TIME</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Acompanhe mudanças no voo
        </Text>
        <Text style={styles.description}>
          Organize avisos de arremetidas, órbitas e alternados nos aeroportos que importam para
          você.
        </Text>

        <View
          nativeID="google-sign-in-button"
          style={[styles.googleButton, Platform.OS !== 'web' && styles.hidden]}
        />
        {state === 'loading' && (
          <ActivityIndicator
            accessibilityLabel="Preparando acesso"
            color="#2b5b54"
            style={styles.activityIndicator}
          />
        )}
        {state !== 'loading' && state !== 'ready' && (
          <Text
            accessibilityRole={state === 'error' ? 'alert' : 'text'}
            style={[
              styles.status,
              state === 'error' && styles.error,
              state === 'signed-in' && styles.success,
            ]}
          >
            {message}
          </Text>
        )}
        {state === 'ready' && <Text style={styles.status}>{message}</Text>}
        {state === 'ready' && (
          <Pressable accessibilityRole="button" onPress={cancelSignIn} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        )}
        {state === 'cancelled' && (
          <Pressable accessibilityRole="button" onPress={retrySignIn} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Tentar novamente</Text>
          </Pressable>
        )}

        <Text style={styles.privacy}>
          Usamos sua conta Google somente para confirmar sua identidade. Nunca armazenamos sua senha
          Google.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#f2f6f5',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e1e9e7',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 480,
    paddingHorizontal: 36,
    paddingVertical: 44,
    width: '100%',
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#e3efec',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 20,
    width: 56,
  },
  brandMarkText: {
    color: '#24534c',
    fontSize: 28,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#52756d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  title: {
    color: '#172c29',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 38,
    marginTop: 16,
    textAlign: 'center',
  },
  description: {
    color: '#5d706c',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
    marginTop: 12,
    textAlign: 'center',
  },
  googleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    width: 280,
  },
  hidden: {
    display: 'none',
  },
  activityIndicator: {
    marginTop: 12,
  },
  status: {
    color: '#5d706c',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
  },
  error: {
    color: '#a43d33',
  },
  success: {
    color: '#24534c',
  },
  cancelButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    color: '#526a65',
    fontSize: 14,
    fontWeight: '600',
  },
  privacy: {
    color: '#899994',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 28,
    maxWidth: 330,
    textAlign: 'center',
  },
});
