#!/usr/bin/env node
/**
 * MiMo alerting smoke test: POST sample metadata to the therapist MiMo HTTP ingest.
 *
 * Prerequisite: therapist Signal Desktop running so the ingest server is listening
 * (default http://127.0.0.1:8765 — see MIMO_INGEST_PORT).
 *
 * Usage:
 *   pnpm run mimo:test-ingest
 *   MIMO_TEST_CLIENT_SESSION_ID=<remote ACI> pnpm run mimo:test-ingest
 *   MIMO_INGEST_PORT=9000 node scripts/mimo-alerting-e2e.mjs
 */

import http from 'node:http';

const port = Number(process.env.MIMO_INGEST_PORT || 8765);
const clientSessionId =
  process.env.MIMO_TEST_CLIENT_SESSION_ID || 'demo-mimo-client-session-id';

function postJson(body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mimo-metadata',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload, 'utf8'),
        },
      },
      res => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`POST → http://127.0.0.1:${port}/mimo-metadata (clientSessionId=${clientSessionId.slice(0, 12)}…)`);
  const ts = Date.now();
  await postJson({
    clientSessionId,
    heartbeatUnixMs: ts,
    gameId: 'mimo-alerting-e2e',
    sessionStatus: 'active',
    connectivityState: 'online',
    currentModule: 'demo',
    expectedActivityType: 'interaction',
    activityProgress: 0.42,
    alerts: [
      {
        alertId: 'e2e-yellow-1',
        type: 'inactivity',
        severity: 'yellow',
        message: 'E2E test: possible inactivity (yellow)',
        timestamp: ts,
      },
    ],
  });
  // eslint-disable-next-line no-console
  console.log('Sent heartbeat + yellow alert.');
  await postJson({
    clientSessionId,
    heartbeatUnixMs: Date.now(),
    gameId: 'mimo-alerting-e2e',
    alerts: [
      {
        alertId: 'e2e-red-1',
        type: 'no_progress',
        severity: 'red',
        message: 'E2E test: escalation to red',
        timestamp: Date.now(),
      },
    ],
  });
  // eslint-disable-next-line no-console
  console.log('Sent red alert.');
  // eslint-disable-next-line no-console
  console.log(
    'In the therapist app: open Session Console → Activity Monitor (alerts summary) and Session Alerts / Signals (per-session when clientSessionId matches a participant ACI).'
  );
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err.message || err);
  process.exitCode = 1;
});
