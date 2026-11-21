import { buildApiApp } from '../../apps/api/src/server.js';
import type {
  GoogleIdTokenVerifier,
  GoogleTokenClaims,
} from '../../apps/api/src/auth/google-auth-service.js';
import { FixtureFlightDataProvider } from '../../apps/api/src/activity/providers/fixture-flight-data-provider.js';

const stubVerifier: GoogleIdTokenVerifier = {
  async verifyIdToken(token: string): Promise<GoogleTokenClaims> {
    const [, subject, nonce] = token.split(':');
    return {
      issuer: 'https://accounts.google.com',
      subject: subject ?? 'e2e-user',
      audience: 'e2e-web-client-id',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      nonce: nonce ?? 'nonce',
    };
  },
};

async function main(): Promise<void> {
  const app = await buildApiApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    googleWebClientId: 'e2e-web-client-id',
    allowedWebOrigins: ['https://flightontime.example'],
    environment: 'test',
    flightDataProvider: new FixtureFlightDataProvider(),
    idTokenVerifier: stubVerifier,
  });

  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  console.log(`E2E_SERVER_URL=${address}`);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.stdin.resume();
  process.stdin.on('end', () => void shutdown());
}

void main();
