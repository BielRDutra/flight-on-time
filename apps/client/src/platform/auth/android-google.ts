import { z } from 'zod';

const ANDROID_SESSION_STORAGE_KEY = 'flight_on_time.android_account_session';

const challengeSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  expiresAt: z.string().datetime(),
});

const sessionResponseSchema = z.object({
  sessionToken: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type AndroidGoogleSignInErrorCode =
  | 'challenge_failed'
  | 'invalid_challenge'
  | 'cancelled'
  | 'no_credential'
  | 'missing_id_token'
  | 'session_exchange_failed'
  | 'storage_failed'
  | 'sign_in_unavailable';

export class AndroidGoogleSignInError extends Error {
  constructor(
    readonly code: AndroidGoogleSignInErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AndroidGoogleSignInError';
  }
}

export interface AndroidCredentialResult {
  status: 'success' | 'cancelled' | 'no_credential';
  idToken?: string | undefined;
}

export interface AndroidCredentialManager {
  requestGoogleIdToken(input: {
    serverClientId: string;
    nonce: string;
  }): Promise<AndroidCredentialResult>;
}

export interface StoredAndroidSession {
  sessionToken: string;
  expiresAt: string;
}

export interface AndroidSecureSessionStore {
  saveSession(session: StoredAndroidSession): Promise<void>;
  getSession(): Promise<StoredAndroidSession | null>;
  clearSession(): Promise<void>;
}

export interface SignInWithAndroidGoogleOptions {
  apiBaseUrl: string;
  googleWebClientId: string;
  fetchImpl?: typeof fetch;
  credentialManager?: AndroidCredentialManager;
  secureStore?: AndroidSecureSessionStore;
}

export function createExpoSecureSessionStore(): AndroidSecureSessionStore {
  return {
    async saveSession(session) {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(ANDROID_SESSION_STORAGE_KEY, JSON.stringify(session));
    },
    async getSession() {
      const SecureStore = await import('expo-secure-store');
      const raw = await SecureStore.getItemAsync(ANDROID_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = sessionResponseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    },
    async clearSession() {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(ANDROID_SESSION_STORAGE_KEY);
    },
  };
}

export function createGoogleSigninCredentialManager(): AndroidCredentialManager {
  return {
    async requestGoogleIdToken({ serverClientId }) {
      const {
        GoogleSignin,
        isCancelledResponse,
        isErrorWithCode,
        isSuccessResponse,
        statusCodes,
      } = await import('@react-native-google-signin/google-signin');

      GoogleSignin.configure({
        webClientId: serverClientId,
        offlineAccess: false,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      try {
        const response = await GoogleSignin.signIn();

        if (isCancelledResponse(response)) {
          return { status: 'cancelled' };
        }

        if (isSuccessResponse(response)) {
          return response.data.idToken
            ? { status: 'success', idToken: response.data.idToken }
            : { status: 'no_credential' };
        }

        return { status: 'no_credential' };
      } catch (error) {
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            return { status: 'cancelled' };
          }
          if (error.code === statusCodes.SIGN_IN_REQUIRED) {
            return { status: 'no_credential' };
          }
        }

        throw error;
      }
    },
  };
}

export async function getStoredAndroidSession(
  secureStore: AndroidSecureSessionStore = createExpoSecureSessionStore(),
): Promise<StoredAndroidSession | null> {
  return secureStore.getSession();
}

export async function clearStoredAndroidSession(
  secureStore: AndroidSecureSessionStore = createExpoSecureSessionStore(),
): Promise<void> {
  await secureStore.clearSession();
}

export async function signInWithAndroidGoogle(
  options: SignInWithAndroidGoogleOptions,
): Promise<StoredAndroidSession> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const credentialManager = options.credentialManager ?? createGoogleSigninCredentialManager();
  const secureStore = options.secureStore ?? createExpoSecureSessionStore();

  const challengeResponse = await fetchImpl(
    `${apiBaseUrl}/v1/auth/google/challenge?platform=android`,
  );

  if (!challengeResponse.ok) {
    throw new AndroidGoogleSignInError(
      'challenge_failed',
      'Não foi possível iniciar o acesso com Google. Tente novamente.',
    );
  }

  const parsedChallenge = challengeSchema.safeParse(await challengeResponse.json());
  if (!parsedChallenge.success || Date.parse(parsedChallenge.data.expiresAt) <= Date.now()) {
    throw new AndroidGoogleSignInError(
      'invalid_challenge',
      'O desafio de acesso expirou ou é inválido. Tente novamente.',
    );
  }

  let credentialResult: AndroidCredentialResult;
  try {
    credentialResult = await credentialManager.requestGoogleIdToken({
      serverClientId: options.googleWebClientId,
      nonce: parsedChallenge.data.nonce,
    });
  } catch (error) {
    if (error instanceof AndroidGoogleSignInError) {
      throw error;
    }

    throw new AndroidGoogleSignInError(
      'sign_in_unavailable',
      'O acesso com Google está indisponível neste dispositivo.',
      { cause: error },
    );
  }

  if (credentialResult.status === 'cancelled') {
    throw new AndroidGoogleSignInError(
      'cancelled',
      'Acesso cancelado. Você pode tentar novamente.',
    );
  }

  if (credentialResult.status === 'no_credential') {
    throw new AndroidGoogleSignInError(
      'no_credential',
      'Nenhuma conta Google disponível foi encontrada neste dispositivo.',
    );
  }

  if (!credentialResult.idToken) {
    throw new AndroidGoogleSignInError(
      'missing_id_token',
      'O Google não retornou uma credencial válida. Tente novamente.',
    );
  }

  const exchangeResponse = await fetchImpl(`${apiBaseUrl}/v1/auth/google/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: parsedChallenge.data.challengeId,
      credential: credentialResult.idToken,
    }),
  });

  if (!exchangeResponse.ok) {
    throw new AndroidGoogleSignInError(
      'session_exchange_failed',
      'Não foi possível concluir o acesso com Google. Tente novamente.',
    );
  }

  const parsedSession = sessionResponseSchema.safeParse(await exchangeResponse.json());
  if (!parsedSession.success) {
    throw new AndroidGoogleSignInError(
      'session_exchange_failed',
      'A resposta de sessão do servidor é inválida.',
    );
  }

  try {
    await secureStore.saveSession(parsedSession.data);
  } catch (error) {
    throw new AndroidGoogleSignInError(
      'storage_failed',
      'Não foi possível armazenar sua sessão com segurança neste dispositivo.',
      { cause: error },
    );
  }

  return parsedSession.data;
}
