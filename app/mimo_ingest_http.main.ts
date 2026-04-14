// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';

import type { BrowserWindow } from 'electron';

import * as Errors from '../ts/types/errors.std.ts';
import { createLogger } from '../ts/logging/log.std.ts';

const log = createLogger('mimoIngestHttp');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let started = false;
let lastReceivedPayload: unknown | null = null;
let lastReceivedAtUnixMs: number | null = null;

export type MimoTherapistIngestOptionsType = Readonly<{
  getMainWindow: () => BrowserWindow | undefined;
  /** Logged-in user's ACI for ReLive auto `clientSessionId` (GET /mimo-local-session). */
  getLocalClientSessionId?: () => string | undefined;
}>;

/**
 * Localhost-only HTTP ingest so the MiMo **client** app can POST metadata
 * (separate Electron process) without the View-menu demo.
 *
 * POST http://127.0.0.1:${port}/mimo-metadata
 * GET  http://127.0.0.1:${port}/mimo-local-session  — current Signal user's ACI when set
 */
export function startMimoIngestHttpServer(
  options: MimoTherapistIngestOptionsType | (() => BrowserWindow | undefined)
): void {
  if (started) {
    return;
  }
  started = true;

  const normalized: MimoTherapistIngestOptionsType =
    typeof options === 'function'
      ? { getMainWindow: options }
      : options;

  const port = Number(process.env.MIMO_INGEST_PORT) || 8765;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/mimo-local-session') {
      const id = normalized.getLocalClientSessionId?.() ?? null;
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(
        JSON.stringify(
          {
            clientSessionId:
              typeof id === 'string' && id.length > 0 ? id : null,
          },
          null,
          2
        )
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/mimo-metadata') {
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(
        JSON.stringify(
          {
            received: Boolean(lastReceivedPayload),
            lastReceivedAtUnixMs,
            payload: lastReceivedPayload,
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
    req.on('data', chunk => {
      chunks.push(chunk as Buffer);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const json: unknown = JSON.parse(raw);
        if (
          json &&
          typeof json === 'object' &&
          'clientSessionId' in json &&
          typeof (json as { clientSessionId: unknown }).clientSessionId ===
            'string' &&
          (json as { clientSessionId: string }).clientSessionId.length > 0
        ) {
          const win = normalized.getMainWindow();
          win?.webContents.send('mimo-ingest-metadata', json);
          lastReceivedPayload = json;
          lastReceivedAtUnixMs = Date.now();
        } else {
          log.warn('mimo ingest: missing clientSessionId');
        }
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
