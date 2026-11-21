import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import {
  ApkTestTab,
  type ApkTestSessionState,
} from '../../../src/features/apk-test/ApkTestTab.js';

function TestApkWrapper({ fetchImpl }: { fetchImpl: typeof fetch }) {
  const [session, setSession] = useState<ApkTestSessionState>({
    accountId: 'apk-tester-01',
    bearerToken: null,
    installationId: null,
    installationCredential: null,
    pushRegistered: false,
  });

  return (
    <ApkTestTab
      apiBaseUrl="http://localhost:3000"
      fetchImpl={fetchImpl}
      onSessionChanged={setSession}
      session={session}
    />
  );
}

describe('ApkTestTab', () => {
  it('checks backend liveness and renders APK build commands', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });

    await render(<TestApkWrapper fetchImpl={fetchImpl} />);

    await waitFor(() => {
      expect(screen.getByText(/Backend local online/i)).toBeTruthy();
    });

    expect(screen.getByText(/com\.flightontime\.app/i)).toBeTruthy();
    expect(screen.getByText(/npx expo run:android/i)).toBeTruthy();
  });

  it('executes Android APK login, installation registration/claim, push subscription, and sign-out lifecycle', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/health/live')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.includes('/v1/auth/google/challenge?platform=android')) {
        return new Response(
          JSON.stringify({
            challengeId: 'apk-challenge-1',
            nonce: 'apk-nonce-1',
            expiresAt: '2030-11-20T12:00:00.000Z',
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/auth/google/session') && method === 'POST') {
        return new Response(
          JSON.stringify({
            sessionToken: 'apk-opaque-bearer-token',
            expiresAt: '2030-11-21T12:00:00.000Z',
          }),
          { status: 201 },
        );
      }
      if (url.endsWith('/v1/installations') && method === 'POST') {
        return new Response(
          JSON.stringify({
            installationId: 'inst-apk-99',
            androidCredential: 'inst-apk-secret-99',
          }),
          { status: 201 },
        );
      }
      if (url.endsWith('/v1/me/installations/inst-apk-99/claim') && method === 'POST') {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/v1/me/installations/inst-apk-99/push-subscription') && method === 'PUT') {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/v1/me/installations/inst-apk-99/claim') && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/v1/me/session') && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    await render(<TestApkWrapper fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/Backend local online/i)).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Simular login Android no APK'));
    await waitFor(() => expect(screen.getByText(/Sessão Android ativa/i)).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Registrar e vincular instalação APK'));
    await waitFor(() => expect(screen.getByText('Instalação: inst-apk-99')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Registrar assinatura push APK'));
    await waitFor(() => expect(screen.getByText(/Push FCM criptografado no servidor/i)).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Encerrar sessão do APK'));
    await waitFor(() => expect(screen.getByText(/Nenhuma sessão APK ativa/i)).toBeTruthy());
  });
});
