const REDACTED_AUTH_FIELDS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.challengeId',
  'req.body.credential',
  'req.body.g_csrf_token',
  'req.body.sessionToken',
  'req.body.subscription.token',
  'req.body.subscription.endpoint',
  'req.body.subscription.keys',
];

export function createAuthLoggerOptions() {
  return {
    redact: {
      paths: REDACTED_AUTH_FIELDS,
      remove: true,
    },
  };
}
