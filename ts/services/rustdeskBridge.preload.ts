// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const RUSTDESK_PATHS = [
  '/Applications/RustDesk.app/Contents/MacOS/RustDesk',
  'rustdesk',
  '/var/lib/flatpak/exports/bin/com.rustdesk.RustDesk',
];

let resolvedBinary: string | null = null;
let rustdeskProcess: ChildProcess | null = null;

function resolveRustDeskBinary(): string | null {
  if (resolvedBinary) {
    return resolvedBinary;
  }

  for (const candidate of RUSTDESK_PATHS) {
    if (!candidate.startsWith('/')) {
      continue;
    }
    if (existsSync(candidate)) {
      resolvedBinary = candidate;
      return resolvedBinary;
    }
  }

  return null;
}

function getBinary(): string {
  return resolvedBinary ?? 'rustdesk';
}

export async function checkRustDeskAvailability(): Promise<boolean> {
  const found = resolveRustDeskBinary();
  if (found) {
    return true;
  }
  try {
    await execFileAsync('which', ['rustdesk']);
    resolvedBinary = 'rustdesk';
    return true;
  } catch {
    return false;
  }
}

async function getRustDeskId(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(getBinary(), ['--get-id']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function setOneTimePassword(): Promise<string> {
  const password = randomBytes(6).toString('base64url').slice(0, 10);
  try {
    await execFileAsync(getBinary(), ['--password', password]);
  } catch {
    await execFileAsync(getBinary(), ['--config', `password=${password}`]);
  }
  return password;
}

export async function startRustDeskService(): Promise<{
  id: string;
  password: string;
} | null> {
  const available = await checkRustDeskAvailability();
  if (!available) {
    return null;
  }

  const password = await setOneTimePassword();

  if (rustdeskProcess) {
    const id = await getRustDeskId();
    if (!id) {
      return null;
    }
    return { id, password };
  }

  rustdeskProcess = spawn(getBinary(), ['--service'], {
    detached: true,
    stdio: 'ignore',
  });
  rustdeskProcess.unref();
  rustdeskProcess.on('exit', () => {
    rustdeskProcess = null;
  });

  await new Promise(resolve => setTimeout(resolve, 1500));
  const id = await getRustDeskId();
  if (!id) {
    stopRustDeskService();
    return null;
  }

  return { id, password };
}

export function stopRustDeskService(): void {
  if (!rustdeskProcess) {
    return;
  }
  try {
    rustdeskProcess.kill('SIGTERM');
  } catch {
    // best effort
  }
  rustdeskProcess = null;
}

