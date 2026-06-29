/**
 * Error reporting hook. Structured single-line JSON so Vercel's runtime log
 * search (and get_runtime_errors) can surface it; when SENTRY_DSN is set we also
 * best-effort forward to Sentry. This is the single place to drop in the full
 * @sentry/nextjs SDK later without touching call sites.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    level: "error",
    message: err.message,
    stack: err.stack,
    ...context,
  };
  // Always log (captured by Vercel runtime logs / get_runtime_errors).
  console.error(`[error] ${JSON.stringify(payload)}`);

  // Optional best-effort Sentry forward (Store endpoint derived from the DSN).
  const dsn = process.env.SENTRY_DSN;
  if (dsn) void forwardToSentry(dsn, err, context).catch(() => {});
}

async function forwardToSentry(dsn: string, err: Error, context?: Record<string, unknown>): Promise<void> {
  // DSN: https://<publicKey>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!m) return;
  const [, key, host, projectId] = m;
  const url = `https://${host}/api/${projectId}/store/?sentry_key=${key}&sentry_version=7`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: "javascript",
      level: "error",
      exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: [] } }] },
      extra: context ?? {},
      timestamp: Date.now() / 1000,
    }),
  });
}
