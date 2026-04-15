// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';

import * as Errors from '../ts/types/errors.std.ts';
import { createLogger } from '../ts/logging/log.std.ts';
import type {
  MiMoAlertPayloadType,
  MiMoAlertSeverityType,
  MiMoAlertTypeString,
  MiMoConnectivityStateType,
  MiMoMetadataIngestPayloadType,
  MiMoSessionStatusType,
} from '../ts/types/MiMoMetadata.std.ts';

export type { MiMoMetadataIngestPayloadType } from '../ts/types/MiMoMetadata.std.ts';

const log = createLogger('mimoIngestHttp');
const MAX_REQUEST_BYTES = 64 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let started = false;

const SESSION_STATUSES = new Set<MiMoSessionStatusType>([
  'active',
  'paused',
  'ended',
]);

const CONNECTIVITY_STATES = new Set<MiMoConnectivityStateType>([
  'online',
  'reconnecting',
  'offline',
]);

const ALERT_TYPES = new Set<MiMoAlertTypeString>([
  'inactivity',
  'no_user',
  'no_progress',
  'mismatch',
  'disconnected',
  'no_motion',
]);

const ALERT_SEVERITIES = new Set<MiMoAlertSeverityType>([
  'green',
  'yellow',
  'red',
]);

type StartMimoIngestHttpServerOptionsType = Readonly<{
  onMetadata: (
    payload: MiMoMetadataIngestPayloadType,
    context?: { forwardedByRelay: boolean }
  ) => void;
  getMetadataSnapshot: () => unknown;
  /** Logged-in user's ACI (or agreed id) for ReLive / bridges to use as `clientSessionId`. */
  getLocalClientSessionId?: () => string | undefined;
}>;

function parseAlertItem(input: unknown): MiMoAlertPayloadType | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const o = input as Record<string, unknown>;
  if (typeof o.alertId !== 'string' || !o.alertId.trim()) {
    return undefined;
  }
  if (typeof o.type !== 'string' || !ALERT_TYPES.has(o.type as MiMoAlertTypeString)) {
    return undefined;
  }
  if (
    typeof o.severity !== 'string' ||
    !ALERT_SEVERITIES.has(o.severity as MiMoAlertSeverityType)
  ) {
    return undefined;
  }
  if (typeof o.message !== 'string') {
    return undefined;
  }
  if (
    typeof o.timestamp !== 'number' ||
    !Number.isFinite(o.timestamp) ||
    o.timestamp <= 0
  ) {
    return undefined;
  }
  return {
    alertId: o.alertId.trim(),
    type: o.type as MiMoAlertTypeString,
    severity: o.severity as MiMoAlertSeverityType,
    message: o.message,
    timestamp: o.timestamp,
  };
}

function parseAlertsField(input: unknown): ReadonlyArray<MiMoAlertPayloadType> | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const out: Array<MiMoAlertPayloadType> = [];
  for (const item of input) {
    const parsed = parseAlertItem(item);
    if (parsed) {
      out.push(parsed);
    } else {
      log.warn('mimo ingest: skipped invalid alert entry');
    }
  }
  return out;
}

function parseMiMoMetadataIngestPayload(
  input: unknown
): MiMoMetadataIngestPayloadType | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const {
    clientSessionId,
    gameId,
    heartbeatUnixMs,
    sessionStatus,
    connectivityState,
    currentModule,
    expectedActivityType,
    activityProgress,
    alerts,
    snapshotRef,
  } = input as Record<string, unknown>;

  if (typeof clientSessionId !== 'string') {
    return undefined;
  }

  const normalizedClientSessionId = clientSessionId.trim();
  if (!normalizedClientSessionId) {
    return undefined;
  }

  if (
    gameId !== undefined &&
    gameId !== null &&
    typeof gameId !== 'string'
  ) {
    return undefined;
  }

  if (
    heartbeatUnixMs !== undefined &&
    (typeof heartbeatUnixMs !== 'number' ||
      !Number.isFinite(heartbeatUnixMs) ||
      heartbeatUnixMs <= 0)
  ) {
    return undefined;
  }

  if (
    sessionStatus !== undefined &&
    (typeof sessionStatus !== 'string' ||
      !SESSION_STATUSES.has(sessionStatus as MiMoSessionStatusType))
  ) {
    return undefined;
  }

  if (
    connectivityState !== undefined &&
    (typeof connectivityState !== 'string' ||
      !CONNECTIVITY_STATES.has(connectivityState as MiMoConnectivityStateType))
  ) {
    return undefined;
  }

  if (
    currentModule !== undefined &&
    currentModule !== null &&
    typeof currentModule !== 'string'
  ) {
    return undefined;
  }

  if (
    expectedActivityType !== undefined &&
    expectedActivityType !== null &&
    typeof expectedActivityType !== 'string'
  ) {
    return undefined;
  }

  if (
    activityProgress !== undefined &&
    activityProgress !== null &&
    (typeof activityProgress !== 'number' ||
      !Number.isFinite(activityProgress))
  ) {
    return undefined;
  }

  if (snapshotRef !== undefined && snapshotRef !== null && typeof snapshotRef !== 'string') {
    return undefined;
  }

  let parsedAlerts: ReadonlyArray<MiMoAlertPayloadType> | undefined;
  if (alerts === undefined) {
    parsedAlerts = undefined;
  } else if (alerts === null) {
    parsedAlerts = [];
  } else {
    const arr = parseAlertsField(alerts);
    if (arr === undefined) {
      return undefined;
    }
    parsedAlerts = arr;
  }

  return {
    clientSessionId: normalizedClientSessionId,
    ...(gameId === undefined ? undefined : { gameId }),
    ...(heartbeatUnixMs === undefined ? undefined : { heartbeatUnixMs }),
    ...(sessionStatus === undefined ? undefined : { sessionStatus: sessionStatus as MiMoSessionStatusType }),
    ...(connectivityState === undefined
      ? undefined
      : { connectivityState: connectivityState as MiMoConnectivityStateType }),
    ...(currentModule === undefined ? undefined : { currentModule }),
    ...(expectedActivityType === undefined ? undefined : { expectedActivityType }),
    ...(activityProgress === undefined ? undefined : { activityProgress }),
    ...(parsedAlerts === undefined ? undefined : { alerts: parsedAlerts }),
    ...(snapshotRef === undefined ? undefined : { snapshotRef }),
  };
}

/**
 * Localhost-only HTTP ingest so a local bridge, game runtime, or demo script can
 * POST MiMo metadata into this app without depending on renderer-only hooks.
 *
 * POST http://127.0.0.1:${port}/mimo-metadata
 * Body: JSON matching MiMoMetadataIngestPayloadType (clientSessionId required;
 * optional gameId, heartbeatUnixMs, session fields, alerts[], snapshotRef).
 */
export function startMimoIngestHttpServer(
  options: StartMimoIngestHttpServerOptionsType
): void {
  if (started) {
    return;
  }
  started = true;

  const port = Number(process.env.MIMO_INGEST_PORT) || 8765;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/mimo-metadata') {
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(options.getMetadataSnapshot(), null, 2));
      return;
    }

    if (req.method === 'GET' && req.url === '/mimo-local-session') {
      const id = options.getLocalClientSessionId?.() ?? null;
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(
        JSON.stringify(
          {
            clientSessionId: typeof id === 'string' && id.length > 0 ? id : null,
          },
          null,
          2
        )
      );
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mimo-metadata') {
      res.writeHead(404, CORS_HEADERS);
      res.end();
      return;
    }

    const chunks: Array<Buffer> = [];
    let requestBytes = 0;
    req.on('data', chunk => {
      const buffer = chunk as Buffer;
      requestBytes += buffer.length;

      if (requestBytes > MAX_REQUEST_BYTES) {
        log.warn('mimo ingest: payload too large');
        res.writeHead(413, CORS_HEADERS);
        res.end();
        req.destroy();
        return;
      }

      chunks.push(buffer);
    });
    req.on('end', () => {
      if (res.writableEnded) {
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const payload = parseMiMoMetadataIngestPayload(JSON.parse(raw));
        if (!payload) {
          log.warn('mimo ingest: invalid payload');
          res.writeHead(400, CORS_HEADERS);
          res.end();
          return;
        }

        const relayHeader = req.headers['x-mimo-forwarded-by'];
        const forwardedByRelay =
          (typeof relayHeader === 'string' &&
            relayHeader.toLowerCase().includes('orchestrator-relay')) ||
          (Array.isArray(relayHeader) &&
            relayHeader.some(value =>
              String(value).toLowerCase().includes('orchestrator-relay')
            ));

        options.onMetadata(payload, { forwardedByRelay });
        res.writeHead(204, CORS_HEADERS);
        res.end();
      } catch (error) {
        log.warn('mimo ingest: bad JSON', Errors.toLogFormat(error));
        res.writeHead(400, CORS_HEADERS);
        res.end();
      }
    });
  });

  server.on('error', error => {
    log.warn('MIMO ingest HTTP server error', Errors.toLogFormat(error));
  });

    // Bind on all interfaces by default so the client machine can reach
  // /mimo-local-session for ACI auto-discovery. Set MIMO_INGEST_BIND=127.0.0.1
  // to restrict to localhost only (e.g. on untrusted networks).
  const bindAddress = process.env.MIMO_INGEST_BIND || '0.0.0.0';

  server.listen(port, bindAddress, () => {
    log.info(
      `MIMO ingest HTTP listening on http://${bindAddress}:${port}/mimo-metadata (POST+GET); /mimo-local-session (GET)`
    );
  });
}
