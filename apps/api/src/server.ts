import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { GoogleAuthService } from './auth/google-auth-service.js';
import { GoogleOAuthIdTokenVerifier } from './auth/google-id-token-verifier.js';
import { SqliteAuthRepository } from './auth/auth-repository.js';
import { createAuthLoggerOptions } from './auth/auth-logger.js';
import { registerGoogleAuthRoutes } from './auth/google-auth-routes.js';
import { openDatabase, runMigrations } from './storage/database.js';

const environmentSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/flight-on-time.sqlite'),
  GOOGLE_WEB_CLIENT_ID: z.string().min(1),
  WEB_ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface ApiConfiguration {
  host: string;
  port: number;
  databasePath: string;
  googleWebClientId: string;
  allowedWebOrigins: string[];
  environment: 'development' | 'test' | 'production';
}

export function loadApiConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfiguration {
  const parsed = environmentSchema.parse(environment);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    googleWebClientId: parsed.GOOGLE_WEB_CLIENT_ID,
    allowedWebOrigins: parsed.WEB_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    environment: parsed.NODE_ENV,
  };
}

export async function buildApiApp(configuration: ApiConfiguration): Promise<FastifyInstance> {
  const app = Fastify({
    logger: createAuthLoggerOptions(),
  });
  const database = openDatabase(configuration.databasePath);

  runMigrations(database, fileURLToPath(new URL('./storage/migrations/', import.meta.url)));

  app.register(cookie);
  app.register(cors, {
    origin: configuration.allowedWebOrigins,
    credentials: true,
  });
  app.register(rateLimit, {
    max: 30,
    timeWindow: '1 minute',
  });

  const authRepository = new SqliteAuthRepository(database);
  const authService = new GoogleAuthService({
    allowedAudiences: {
      web: [configuration.googleWebClientId],
      android: [configuration.googleWebClientId],
    },
    repository: authRepository,
    verifier: new GoogleOAuthIdTokenVerifier(),
  });

  await registerGoogleAuthRoutes(app, {
    service: authService,
    allowedWebOrigins: configuration.allowedWebOrigins,
    secureCookies: configuration.environment === 'production',
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.addHook('onClose', async () => {
    database.close();
  });

  return app;
}

async function start(): Promise<void> {
  const configuration = loadApiConfiguration();
  const app = await buildApiApp(configuration);
  await app.listen({ host: configuration.host, port: configuration.port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await start();
}
