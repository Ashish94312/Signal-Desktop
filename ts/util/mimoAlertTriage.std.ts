// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  MiMoAlertPayloadType,
  MiMoAlertSeverityType,
} from '../types/MiMoMetadata.std.ts';

const SEVERITY_RANK: Record<MiMoAlertSeverityType, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

/**
 * Worst MiMo severity in the list (red > yellow > green). Empty → null.
 */
export function getWorstMiMoAlertSeverity(
  alerts: ReadonlyArray<MiMoAlertPayloadType> | undefined
): MiMoAlertSeverityType | null {
  if (alerts == null || alerts.length === 0) {
    return null;
  }
  let worst: MiMoAlertSeverityType | null = null;
  let rank = -1;
  for (const a of alerts) {
    const r = SEVERITY_RANK[a.severity];
    if (r > rank) {
      rank = r;
      worst = a.severity;
    }
  }
  return worst;
}

export type MiMoConsoleCueType = Readonly<{
  detail: string;
  label: string;
  tone: 'good' | 'info' | 'warning' | 'critical';
}>;

export function miMoAlertsToConsoleCues(
  alerts: ReadonlyArray<MiMoAlertPayloadType>
): ReadonlyArray<MiMoConsoleCueType> {
  return alerts.map(a => ({
    label: `MiMo · ${a.type}`,
    detail: a.message,
    tone:
      a.severity === 'red'
        ? 'critical'
        : a.severity === 'yellow'
          ? 'warning'
          : 'good',
  }));
}
