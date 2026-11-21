import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ActivityFilterService } from './activity/filters/activity-filter-service.js';
import type { FlightDataProvider } from './activity/providers/flight-data-provider.js';
import { FixtureFlightDataProvider } from './activity/providers/fixture-flight-data-provider.js';
import { registerEventsRoutes } from './activity/routes/events.js';
import { registerFilterOptionsRoutes } from './activity/routes/filter-options.js';
import { SqliteEventRepository } from './activity/storage/event-repository.js';
import { GoogleAuthService, type GoogleIdTokenVerifier } from './auth/google-auth-service.js';
import { GoogleOAuthIdTokenVerifier } from './auth/google-id-token-verifier.js';
import { SqliteAuthRepository } from './auth/auth-repository.js';
import { createAuthLoggerOptions } from './auth/auth-logger.js';
import { registerGoogleAuthRoutes } from './auth/google-auth-routes.js';
import { AlertDeliveryWorker } from './notifications/delivery-worker.js';
import { registerInstallationRoutes } from './notifications/installation-routes.js';
import {
  PushSecretCipher,
  SqliteNotificationRepository,
} from './notifications/notification-repository.js';
import {
  UnconfiguredAndroidPushProvider,
  type AndroidPushProvider,
} from './notifications/providers/android-push-provider.js';
import {
  UnconfiguredWebPushProvider,
  type WebPushProvider,
} from './notifications/providers/web-push-provider.js';
import { registerPushSubscriptionRoutes } from './notifications/push-subscription-routes.js';
import { SqlitePreferenceRepository } from './preferences/preference-repository.js';
import { registerPreferenceRoutes } from './preferences/preference-routes.js';
import { PreferenceService } from './preferences/preference-service.js';
import { openDatabase, runMigrations } from './storage/database.js';

const environmentSchema = z
  .object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_PATH: z.string().min(1).default('./data/flight-on-time.sqlite'),
    GOOGLE_WEB_CLIENT_ID: z.string().min(1),
    WEB_ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
    PUSH_ENCRYPTION_KEY: z.string().optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && !env.PUSH_ENCRYPTION_KEY?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUSH_ENCRYPTION_KEY'],
        message: 'PUSH_ENCRYPTION_KEY is required in production.',
      });
    }
  });

export interface ApiConfiguration {
  host: string;
  port: number;
  databasePath: string;
  googleWebClientId: string;
  allowedWebOrigins: string[];
  environment: 'development' | 'test' | 'production';
  pushEncryptionKey?: string;
  flightDataProvider?: FlightDataProvider;
  idTokenVerifier?: GoogleIdTokenVerifier;
  androidPushProvider?: AndroidPushProvider;
  webPushProvider?: WebPushProvider;
  onNotificationWorkerReady?: (worker: AlertDeliveryWorker) => void;
  now?: () => Date;
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
    ...(parsed.PUSH_ENCRYPTION_KEY ? { pushEncryptionKey: parsed.PUSH_ENCRYPTION_KEY } : {}),
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
    verifier: configuration.idTokenVerifier ?? new GoogleOAuthIdTokenVerifier(),
    ...(configuration.now ? { now: configuration.now } : {}),
  });

  await registerGoogleAuthRoutes(app, {
    service: authService,
    allowedWebOrigins: configuration.allowedWebOrigins,
    secureCookies: configuration.environment === 'production',
  });

  const flightDataProvider =
    configuration.flightDataProvider ?? new FixtureFlightDataProvider();
  const eventRepository = new SqliteEventRepository(database);
  eventRepository.seedFromProvider(flightDataProvider);
  const activityFilterService = new ActivityFilterService(eventRepository, flightDataProvider);

  await registerFilterOptionsRoutes(app, activityFilterService);
  await registerEventsRoutes(app, activityFilterService);

  const preferenceRepository = new SqlitePreferenceRepository(database);
  const preferenceService = new PreferenceService(
    preferenceRepository,
    configuration.now ? { now: configuration.now } : {},
  );
  await registerPreferenceRoutes(app, {
    authService,
    preferenceService,
  });

  const encryptionKey =
    configuration.pushEncryptionKey ??
    (configuration.environment === 'production' ? '' : randomBytes(32).toString('hex'));
  const notificationRepository = new SqliteNotificationRepository(
    database,
    new PushSecretCipher(encryptionKey),
  );
  await registerInstallationRoutes(app, {
    authService,
    repository: notificationRepository,
    secureCookies: configuration.environment === 'production',
    ...(configuration.now ? { now: configuration.now } : {}),
  });
  await registerPushSubscriptionRoutes(app, {
    authService,
    repository: notificationRepository,
    ...(configuration.now ? { now: configuration.now } : {}),
  });

  const deliveryWorker = new AlertDeliveryWorker({
    repository: notificationRepository,
    androidProvider: configuration.androidPushProvider ?? new UnconfiguredAndroidPushProvider(),
    webProvider: configuration.webPushProvider ?? new UnconfiguredWebPushProvider(),
    ...(configuration.now ? { now: configuration.now } : {}),
  });
  configuration.onNotificationWorkerReady?.(deliveryWorker);

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
