// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
//
// Session Console chrome for the device-linking (QR) install step so linking
// appears under "Devices" like the main Therapist Console, even though the
// full console modal is not mounted during AppViewType.Installer.

import type { ReactNode } from 'react';
import React from 'react';
import {
  CS,
  ICONS,
  csAside,
  csHeader,
  csHeaderEyebrow,
  csHeaderTitle,
  csMainColumn,
  csNavTabIcon,
  csSectionLabel,
  csShellTab,
  csShellPanel,
  csStatusCard,
  csStatusDot,
} from './therapistConsoleClinicalSerenity.std.ts';

const TAB_ICONS: Record<string, string> = {
  workspace: ICONS.workspace,
  chats: ICONS.chat,
  devices: ICONS.devices,
  system: ICONS.system,
  console: ICONS.info,
};

const SHELL_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'workspace', label: 'Sessions' },
  { id: 'chats', label: 'Messages' },
  { id: 'devices', label: 'Devices' },
  { id: 'system', label: 'Environment' },
  { id: 'console', label: 'Help' },
];

function Icon({
  svg,
  size = 16,
  color,
}: {
  svg: string;
  size?: number;
  color?: string;
}): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        color: color ?? 'currentColor',
        flexShrink: 0,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export type TherapistInstallLinkShellPropsType = Readonly<{
  mainColumn: ReactNode;
}>;

export function TherapistInstallLinkShell({
  mainColumn,
}: TherapistInstallLinkShellPropsType): React.JSX.Element {
  return (
    <div
      className="module-InstallScreenQrCodeNotScannedStep__shell-root"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        minHeight: 0,
        padding: '16px',
        background: CS.gradientSurface,
      }}
    >
      <section
        aria-label="Signal Therapy Session Console — link device"
        style={{
          ...csShellPanel(),
          maxWidth: '1480px',
          width: '100%',
          height: '100%',
          maxHeight: '100%',
        }}
      >
        <header style={csHeader()}>
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: CS.radiusLg,
                background: CS.gradientSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(27, 123, 110, 0.22)',
                flexShrink: 0,
              }}
            >
              <Icon svg={ICONS.leaf} size={20} color="#fff" />
            </div>
            <div>
              <div style={csHeaderEyebrow()}>Signal Therapy</div>
              <h1 style={csHeaderTitle()}>Session Console</h1>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: CS.radiusFull,
              background: CS.infoSoft,
              border: `1px solid rgba(56, 104, 196, 0.15)`,
            }}
          >
            <span
              style={{
                ...csStatusDot(CS.info),
                width: '8px',
                height: '8px',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 650,
                color: CS.info,
              }}
            >
              Linking device
            </span>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '200px minmax(0, 1fr)',
            minHeight: 0,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <aside style={csAside()}>
            <div style={csStatusCard()}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: CS.secondarySoft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon svg={ICONS.link} size={18} color={CS.secondary} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: CS.onSurface,
                      fontFamily: CS.fontDisplay,
                    }}
                  >
                    Link this computer
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: CS.onSurfaceMuted,
                      marginTop: '1px',
                    }}
                  >
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: CS.onSurfaceVariant,
                  lineHeight: 1.5,
                }}
              >
                Scan the QR code with Signal on your phone to connect this
                desktop.
              </div>
            </div>

            <div
              style={{
                ...csSectionLabel(),
                paddingLeft: '14px',
                marginBottom: '6px',
              }}
            >
              Navigation
            </div>
            <nav
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                marginBottom: '20px',
              }}
              aria-label="Session Console sections"
            >
              {SHELL_TABS.map(tab => {
                const isDevices = tab.id === 'devices';
                return (
                  <div
                    key={tab.id}
                    style={{
                      ...csShellTab(isDevices),
                      ...(isDevices
                        ? {}
                        : {
                            opacity: 0.45,
                            pointerEvents: 'none',
                            cursor: 'default',
                            boxShadow: 'none',
                          }),
                    }}
                    aria-current={isDevices ? 'page' : undefined}
                  >
                    <span
                      style={csNavTabIcon(isDevices)}
                      dangerouslySetInnerHTML={{
                        __html: TAB_ICONS[tab.id] ?? '',
                      }}
                    />
                    {tab.label}
                  </div>
                );
              })}
            </nav>
          </aside>

          <div style={{ ...csMainColumn(), minHeight: 0, overflow: 'auto' }}>
            {mainColumn}
          </div>
        </div>
      </section>
    </div>
  );
}
