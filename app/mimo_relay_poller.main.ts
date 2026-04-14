// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
//
// Polls a remote MiMo relay (e.g. ngrok-forwarded ingest server) and forwards
// each client snapshot into the therapist renderer via the same IPC channel
// used by the local HTTP ingest server.
//
// Configure via .env.mimo at the project root (preferred) or raw env vars:
//   MIMO_RELAY_POLL_URL            – full GET URL (e.g. https://…/mimo-metadata)
//   MIMO_RELAY_POLL_INTERVAL_MS    – poll cadence in ms (default: 8000)

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

import * as Errors from '../ts/types/errors.std.ts';
import { createLogger } from '../ts/logging/log.std.ts';

const log = createLogger('mimoRelayPoller');

// ---------------------------------------------------------------------------
// Load .env.mimo from project root (one level up from /app/)
// Variables already set in process.env are NOT overwritten.
// ---------------------------------------------------------------------------
function loadMimoEnvFile(): void {
  const envPath = path.join(__dirname, '..', '.env.mimo');
  let raw: string;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch {
    // File is optional – silently skip if absent
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, ''); // strip optional surrounding quotes
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }

  log.info('.env.mimo loaded from', envPath);
}

loadMimoEnvFile();

export type MimoRelayPollerOptionsType = Readonly<{
  getMainWindow: () => BrowserWindow | undefined;
}>;

/**
 * GET the relay URL and return parsed JSON, or throw on any error.
 */
function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 10_000,
      },
      res => {
        const chunks: Array<Buffer> = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode !== 200) {
              reject(
                new Error(
                  `relay GET returned HTTP ${res.statusCode ?? '?'}: ${body.slice(0, 120)}`
                )
              );
              return;
            }
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('relay GET timed out'));
    });
  });
}

/**
 * Start polling the relay URL.  Safe to call multiple times – only one poller
 * is ever running.  Returns a stop function.
 */
export function startMimoRelayPoller(
  options: MimoRelayPollerOptionsType
): () => void {
  const relayUrl = process.env.MIMO_RELAY_POLL_URL?.trim();

  if (!relayUrl) {
    log.info(
      'MIMO_RELAY_POLL_URL not set – relay poller disabled. ' +
        'Set it to the ngrok GET endpoint to enable.'
    );
    return () => undefined;
  }

  const intervalMs =
    Number(process.env.MIMO_RELAY_POLL_INTERVAL_MS) || 8_000;

  log.info(
    `MIMO relay poller starting → ${relayUrl} every ${intervalMs}ms`
  );

  let consecutiveErrors = 0;

  async function poll(): Promise<void> {
    const win = options.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }

    try {
      const data = await getJson(relayUrl as string);

      if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as Record<string, unknown>).clients)
      ) {
        log.warn('relay poll: unexpected response shape', String(data).slice(0, 200));
        return;
      }

      const { clients } = data as { clients: Array<unknown> };

      let forwarded = 0;
      for (const client of clients) {
        if (
          !client ||
          typeof client !== 'object' ||
          typeof (client as Record<string, unknown>).clientSessionId !== 'string' ||
          !(client as Record<string, unknown>).clientSessionId
        ) {
          continue;
        }

        // Strip relay-internal field before forwarding
        const { lastIngestedUnixMs: _dropped, ...snapshot } =
          client as Record<string, unknown>;

        win.webContents.send('mimo-ingest-metadata', snapshot);
        forwarded += 1;
      }

      if (consecutiveErrors > 0) {
        log.info(`relay poll: recovered after ${consecutiveErrors} error(s)`);
      }
      consecutiveErrors = 0;

      if (forwarded > 0) {
        log.info(`relay poll: forwarded ${forwarded} client snapshot(s)`);
      }
    } catch (error) {
      consecutiveErrors += 1;
      // Log at warn only on first error and every 10th thereafter to avoid spam
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        log.warn(
          `relay poll: error (${consecutiveErrors} consecutive)`,
          Errors.toLogFormat(error)
        );
      }
    }
  }

  // Kick off an immediate poll then repeat on interval
  void poll();
  const timer = setInterval(() => void poll(), intervalMs);

  return () => {
    clearInterval(timer);
    log.info('MIMO relay poller stopped');
  };
}
