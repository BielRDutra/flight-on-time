import { z } from 'zod';

const challengeSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  expiresAt: z.string().datetime(),
});

let googleIdentityServicesLoad: Promise<GoogleIdentityServices> | undefined;

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityButtonOptions {
  theme: 'outline';
  size: 'large';
  text: 'signin_with';
  shape: 'rectangular';
  width: number;
}

export interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        callback(response: GoogleCredentialResponse): void;
      }): void;
      renderButton(element: HTMLElement, options: GoogleIdentityButtonOptions): void;
      cancel?(): void;
    };
  };
}

export class WebGoogleSignInError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WebGoogleSignInError';
  }
}

interface BeginWebGoogleSignInOptions {
  apiBaseUrl: string;
  googleWebClientId: string;
  button: HTMLElement;
  fetchImpl?: typeof fetch;
  identity?: GoogleIdentityServices;
  loadIdentityServices?: () => Promise<GoogleIdentityServices>;
  readCookie?: (name: string) => string | undefined;
  onSignedIn: () => void;
  onError: (error: WebGoogleSignInError) => void;
  onCancelled?: () => void;
}

type CancelSignIn = (notifyUser?: boolean) => void;

const buttonOptions: GoogleIdentityButtonOptions = {
  theme: 'outline',
  size: 'large',
  text: 'signin_with',
  shape: 'rectangular',
  width: 280,
};

export async function beginWebGoogleSignIn(
  options: BeginWebGoogleSignInOptions,
): Promise<CancelSignIn> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  let active = true;
  let identity: GoogleIdentityServices | undefined;
  let exchangeController: AbortController | undefined;

  try {
    const challengeResponse = await fetchImpl(
      `${apiBaseUrl}/v1/auth/google/challenge?platform=web`,
      { credentials: 'include' },
    );

    if (!challengeResponse.ok) {
      throw new WebGoogleSignInError(
        'challenge_failed',
        'Não foi possível iniciar o acesso com Google. Tente novamente.',
      );
    }

    const challenge = challengeSchema.safeParse(await challengeResponse.json());
    if (!challenge.success || Date.parse(challenge.data.expiresAt) <= Date.now()) {
      throw new WebGoogleSignInError(
        'invalid_challenge',
        'O desafio de acesso expirou ou é inválido. Tente novamente.',
      );
    }

    identity =
      options.identity ?? (await (options.loadIdentityServices ?? loadGoogleIdentityServices)());

    identity.accounts.id.initialize({
      client_id: options.googleWebClientId,
      nonce: challenge.data.nonce,
      callback: (response) => {
        if (!active) {
          return;
        }

        if (!response.credential) {
          options.onCancelled?.();
          return;
        }

        const csrfToken = (options.readCookie ?? readCookie)('g_csrf_token');
        if (!csrfToken) {
          options.onError(
            new WebGoogleSignInError(
              'csrf_cookie_missing',
              'Não foi possível verificar o acesso com Google. Recarregue a página e tente novamente.',
            ),
          );
          return;
        }

        exchangeController = new AbortController();
        void exchangeGoogleCredential({
          fetchImpl,
          apiBaseUrl,
          credential: response.credential,
          csrfToken,
          signal: exchangeController.signal,
          isActive: () => active,
          onSignedIn: () => {
            active = false;
            options.onSignedIn();
          },
          onError: options.onError,
        });
      },
    });
    identity.accounts.id.renderButton(options.button, buttonOptions);
  } catch (error) {
    if (error instanceof WebGoogleSignInError) {
      options.onError(error);
    } else {
      options.onError(
        new WebGoogleSignInError(
          'sign_in_unavailable',
          'O acesso com Google está temporariamente indisponível. Tente novamente.',
          { cause: error },
        ),
      );
    }
  }

  return (notifyUser = true) => {
    if (!active) {
      return;
    }

    active = false;
    exchangeController?.abort();
    identity?.accounts.id.cancel?.();
    if (notifyUser) {
      options.onCancelled?.();
    }
  };
}

async function exchangeGoogleCredential(options: {
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
  credential: string;
  csrfToken: string;
  signal: AbortSignal;
  isActive: () => boolean;
  onSignedIn: () => void;
  onError: (error: WebGoogleSignInError) => void;
}): Promise<void> {
  try {
    const response = await options.fetchImpl(`${options.apiBaseUrl}/v1/auth/google/session`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      signal: options.signal,
      body: new URLSearchParams({
        credential: options.credential,
        g_csrf_token: options.csrfToken,
      }).toString(),
    });

    if (!response.ok) {
      throw new WebGoogleSignInError(
        'session_exchange_failed',
        'Não foi possível concluir o acesso com Google. Tente novamente.',
      );
    }

    if (options.isActive()) {
      options.onSignedIn();
    }
  } catch (error) {
    if (!options.isActive()) {
      return;
    }

    options.onError(
      error instanceof WebGoogleSignInError
        ? error
        : new WebGoogleSignInError(
            'session_exchange_failed',
            'Não foi possível concluir o acesso com Google. Verifique a conexão e tente novamente.',
            { cause: error },
          ),
    );
  }
}

async function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new WebGoogleSignInError(
      'web_only',
      'O acesso com Google está disponível somente na versão web.',
    );
  }

  if (window.google?.accounts.id) {
    return window.google;
  }

  googleIdentityServicesLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(
          new WebGoogleSignInError(
            'gis_load_failed',
            'Não foi possível carregar o acesso com Google. Tente novamente.',
          ),
        );
      },
      { once: true },
    );
    document.head.appendChild(script);
  })
    .then(() => {
      if (!window.google?.accounts.id) {
        throw new WebGoogleSignInError(
          'gis_unavailable',
          'O acesso com Google não foi inicializado. Tente novamente.',
        );
      }

      return window.google;
    })
    .catch((error: unknown) => {
      googleIdentityServicesLoad = undefined;
      throw error;
    });

  return googleIdentityServicesLoad;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}
