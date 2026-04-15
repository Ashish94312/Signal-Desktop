// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
//
// "Warm Clinical" design system for the Therapist Console.
// Inspired by best-in-class telehealth UIs (Talkspace, BetterHelp, Headway)
// with warm neutrals, calming sage/teal, and soft depth instead of cold
// blue-gray developer aesthetics. Every token is designed for long-session
// comfort, quick scannability, and reduced cognitive load.

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Core tokens
// ---------------------------------------------------------------------------

export const CS = {
  // Surface hierarchy — warm neutrals with subtle warmth
  surface: '#FAFAF7',
  surfaceLow: '#F3F2EE',
  surfaceHigh: '#E8E6E0',
  surfaceHighest: '#DDDBD4',
  card: '#FFFFFF',
  cardElevated: 'rgba(255, 255, 255, 0.94)',

  // Text — warm dark tones instead of cold blue-blacks
  onSurface: '#1C1B18',
  onSurfaceSecondary: '#3D3B36',
  onSurfaceVariant: '#5E5C56',
  onSurfaceMuted: '#918F88',

  // Brand — warmer navy that feels authoritative yet approachable
  primary: '#2B3A7D',
  primaryHover: '#3346A0',
  primaryContainer: '#4458B8',
  primarySoft: 'rgba(43, 58, 125, 0.07)',
  primaryGlow: 'rgba(43, 58, 125, 0.12)',

  // Accent — warm sage-teal that evokes calm and trust
  secondary: '#1B7B6E',
  secondaryHover: '#22907F',
  secondaryContainer: '#28A594',
  secondarySoft: 'rgba(27, 123, 110, 0.07)',

  // Tertiary — warm earth tone
  tertiary: '#3D4A3C',
  tertiaryMuted: '#5C6E5B',

  // Semantic — warmer versions that don't jar
  success: '#2D7A4E',
  successSoft: 'rgba(45, 122, 78, 0.09)',
  warning: '#B8700E',
  warningSoft: 'rgba(184, 112, 14, 0.09)',
  critical: '#C04444',
  criticalSoft: 'rgba(192, 68, 68, 0.09)',
  info: '#3868C4',
  infoSoft: 'rgba(56, 104, 196, 0.07)',

  // Outline — warm with more transparency
  outlineVariant: '#C6C4BB',
  outlineSubtle: 'rgba(195, 191, 180, 0.32)',

  // Depth — warm shadow base for a softer, more premium feel
  shadow1: '0 1px 3px rgba(28, 27, 24, 0.04), 0 1px 2px rgba(28, 27, 24, 0.05)',
  shadow2: '0 4px 14px rgba(28, 27, 24, 0.06), 0 1px 4px rgba(28, 27, 24, 0.03)',
  shadow3: '0 10px 32px rgba(28, 27, 24, 0.08), 0 4px 10px rgba(28, 27, 24, 0.04)',

  // Glass — slightly warmer, higher blur for softer feel
  glass: 'rgba(255, 255, 253, 0.76)',
  glassBlur: 'blur(24px)',
  glassBorder: 'rgba(255, 255, 250, 0.40)',
  overlayScrim: 'rgba(28, 27, 24, 0.38)',

  // Typography — humanist display + clean body
  fontDisplay:
    "'Manrope', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontBody:
    "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono:
    "'SF Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace",

  // Radii — rounder for friendlier feel
  radius: '10px',
  radiusMd: '12px',
  radiusLg: '16px',
  radiusXl: '22px',
  radiusFull: '999px',

  // Transitions — slightly longer for smoother feel
  transitionFast: '140ms cubic-bezier(0.22, 0.1, 0.36, 1)',
  transitionBase: '220ms cubic-bezier(0.22, 0.1, 0.36, 1)',
  transitionSlow: '360ms cubic-bezier(0.22, 0.1, 0.36, 1)',

  // Gradients — warmer, more subtle
  gradientPrimary: 'linear-gradient(135deg, #2B3A7D 0%, #4458B8 100%)',
  gradientSecondary: 'linear-gradient(135deg, #1B7B6E 0%, #28A594 100%)',
  gradientCritical: 'linear-gradient(135deg, #C04444 0%, #A03636 100%)',
  gradientWarning: 'linear-gradient(135deg, #B8700E 0%, #9A5A0A 100%)',
  gradientSurface: 'linear-gradient(180deg, #FAFAF7 0%, #F3F2EE 100%)',
  gradientHeader: 'linear-gradient(135deg, #F5F4F0 0%, #EDECE7 50%, #F5F4F0 100%)',
} as const;

// ---------------------------------------------------------------------------
// SVG icon helpers (inline, no external deps)
// ---------------------------------------------------------------------------

export const ICONS = {
  workspace: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><rect x="9.5" y="1.5" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><rect x="1.5" y="9.5" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"/></svg>`,
  chat: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 3a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 3v6A1.5 1.5 0 0 1 12 10.5H5.5L3 13V10.5h-.5A1.5 1.5 0 0 1 1 9V3z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  devices: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 13h6M8 10v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  system: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 7v4M8 5.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  phone: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.2 1.8a1 1 0 0 1 1.4-.1l2 1.7a1 1 0 0 1 .2 1.2l-.8 1.6a7.6 7.6 0 0 0 4 4l1.6-.8a1 1 0 0 1 1.2.2l1.7 2a1 1 0 0 1-.1 1.4l-1.2 1a2 2 0 0 1-2.2.2A13.4 13.4 0 0 1 2 6.2a2 2 0 0 1 .2-2.2l1-1.2z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  video: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 6.5l4-2v7l-4-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.3l-1.2 1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9.5 6.5a3 3 0 0 0-4.2-.3l-2 2a3 3 0 0 0 4.2 4.3l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  mic: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M6 14.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  micOff: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M6 14.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M2 2l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  camera: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3"/></svg>`,
  cameraOff: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 2l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  screen: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 14h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  speaker: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 6h2l4-3v10L4 10H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11 5a4 4 0 0 1 0 6M13 3a7 7 0 0 1 0 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  sparkle: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  users: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 13.5a4.5 4.5 0 0 1 9 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="11.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M11 13.5a4 4 0 0 0-1.5-3.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  shield: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.5 4v4c0 3.5 2.3 5.8 5.5 6.5 3.2-.7 5.5-3 5.5-6.5V4L8 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 8l1.5 1.5L10 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  focus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  endCall: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M3 9l-.5 2.5 3-.5V9M13 9l.5 2.5-3-.5V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 2.5H4A1.5 1.5 0 0 0 2.5 4v7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  share: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3.5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="4" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12.5" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M5.8 7l4.4-2.5M5.8 9l4.4 2.5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  refresh: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 8a5.5 5.5 0 0 1 9.5-3.8M13.5 8a5.5 5.5 0 0 1-9.5 3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M12 1v3.2h-3.2M4 15v-3.2h3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pulse: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8h3l1.5-4 3 8L10 6l1.5 2H15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mute: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 6h2l4-3v10L4 10H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  userRemove: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 14a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 6h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  deny: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M4 4l8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  leaf: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 3S9 4 7 7c-2 3-3 6-3 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M13 3C10.5 3 5.5 4 4 8c-.5 1.4-.5 3 0 5 2-1 4-2.5 5.5-4.5S13 3 13 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  calendar: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  heart: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 0 1 6 0 3 3 0 0 1 6 0c0 3.5-6 7.5-6 7.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5a1.8 1.8 0 0 1 2.5 2.5L5.5 13.5 2 14.5l1-3.5L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 4l2.5 2.5" stroke="currentColor" stroke-width="1.3"/></svg>`,
} as const;

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function csBackdrop(): CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    background: CS.overlayScrim,
    backdropFilter: CS.glassBlur,
    WebkitBackdropFilter: CS.glassBlur,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: '24px',
  };
}

export function csShellPanel(): CSSProperties {
  return {
    width: 'min(1480px, 100%)',
    height: '100%',
    borderRadius: CS.radiusXl,
    overflow: 'hidden',
    background: CS.surface,
    color: CS.onSurface,
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    boxShadow: CS.shadow3,
    fontFamily: CS.fontBody,
    border: `1px solid ${CS.glassBorder}`,
  };
}

export function csHeader(): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 28px',
    background: CS.gradientHeader,
    borderBottom: `1px solid ${CS.outlineSubtle}`,
  };
}

export function csHeaderEyebrow(): CSSProperties {
  return {
    fontSize: '0.625rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
    color: CS.secondary,
    marginBottom: '3px',
    fontFamily: CS.fontBody,
  };
}

export function csHeaderTitle(): CSSProperties {
  return {
    margin: 0,
    fontSize: '1.125rem',
    lineHeight: 1.25,
    fontWeight: 800,
    fontFamily: CS.fontDisplay,
    color: CS.onSurface,
    letterSpacing: '-0.02em',
  };
}

export function csCloseButton(): CSSProperties {
  return {
    border: `1px solid ${CS.outlineSubtle}`,
    borderRadius: CS.radiusFull,
    padding: '8px 18px',
    background: CS.glass,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: CS.onSurfaceVariant,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12px',
    fontFamily: CS.fontBody,
    boxShadow: 'none',
    transition: `all ${CS.transitionFast}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    letterSpacing: '0.01em',
  };
}

export function csAside(): CSSProperties {
  return {
    borderRight: 'none',
    background: CS.surfaceLow,
    padding: '20px 16px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };
}

export function csMainColumn(): CSSProperties {
  return {
    padding: '28px 32px',
    overflow: 'auto',
    textAlign: 'left',
    background: CS.surface,
  };
}

// ---------------------------------------------------------------------------
// Cards & containers
// ---------------------------------------------------------------------------

export function csStatusCard(): CSSProperties {
  return {
    padding: '16px 18px',
    borderRadius: CS.radiusLg,
    background: CS.card,
    marginBottom: '20px',
    textAlign: 'left',
    boxShadow: CS.shadow1,
    border: `1px solid ${CS.outlineSubtle}`,
  };
}

export function csCard(): CSSProperties {
  return {
    padding: '20px 22px',
    borderRadius: CS.radiusLg,
    background: CS.card,
    boxShadow: CS.shadow1,
    border: `1px solid ${CS.outlineSubtle}`,
  };
}

export function csCardElevated(): CSSProperties {
  return {
    padding: '20px 22px',
    borderRadius: CS.radiusLg,
    background: CS.cardElevated,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: CS.shadow2,
    border: `1px solid ${CS.glassBorder}`,
  };
}

export function csCardNested(): CSSProperties {
  return {
    padding: '16px 18px',
    borderRadius: CS.radiusMd,
    background: CS.surfaceLow,
    border: `1px solid ${CS.outlineSubtle}`,
  };
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export function csSectionLabel(): CSSProperties {
  return {
    fontSize: '0.6875rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontWeight: 650,
    color: CS.onSurfaceMuted,
    marginBottom: '8px',
    fontFamily: CS.fontBody,
  };
}

export function csDisplayMuted(): CSSProperties {
  return {
    color: CS.onSurfaceVariant,
    fontSize: '14px',
    lineHeight: 1.6,
  };
}

export function csWorkspaceTitle(): CSSProperties {
  return {
    marginTop: 0,
    marginBottom: '8px',
    fontSize: '1.375rem',
    lineHeight: 1.25,
    fontWeight: 800,
    fontFamily: CS.fontDisplay,
    color: CS.onSurface,
    letterSpacing: '-0.02em',
  };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function csShellTab(selected: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: CS.radiusMd,
    padding: '11px 16px',
    background: selected ? CS.card : 'transparent',
    color: selected ? CS.primary : CS.onSurfaceVariant,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: CS.fontBody,
    fontSize: '13px',
    fontWeight: selected ? 650 : 500,
    boxShadow: selected ? CS.shadow1 : 'none',
    transition: `all ${CS.transitionFast}`,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    position: 'relative',
    letterSpacing: selected ? '0' : '0.005em',
  };
}

export function csNavTabIcon(selected: boolean): CSSProperties {
  return {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    opacity: selected ? 1 : 0.55,
    transition: `opacity ${CS.transitionFast}`,
  };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function csPrimaryButton(disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      border: 'none',
      borderRadius: CS.radiusMd,
      padding: '10px 20px',
      background: CS.surfaceHigh,
      color: CS.onSurfaceMuted,
      cursor: 'not-allowed',
      fontWeight: 600,
      fontSize: '13px',
      fontFamily: CS.fontBody,
      opacity: 0.65,
      transition: `all ${CS.transitionFast}`,
      letterSpacing: '0.01em',
    };
  }
  return {
    border: 'none',
    borderRadius: CS.radiusMd,
    padding: '10px 20px',
    background: CS.gradientPrimary,
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    fontFamily: CS.fontBody,
    transition: `all ${CS.transitionFast}`,
    boxShadow: '0 2px 8px rgba(43, 58, 125, 0.22)',
    letterSpacing: '0.01em',
  };
}

export function csSecondaryButton(): CSSProperties {
  return {
    border: `1px solid ${CS.outlineSubtle}`,
    borderRadius: CS.radiusMd,
    padding: '10px 20px',
    background: CS.card,
    color: CS.onSurface,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    fontFamily: CS.fontBody,
    transition: `all ${CS.transitionFast}`,
    boxShadow: CS.shadow1,
    letterSpacing: '0.01em',
  };
}

export function csIconButton(variant: 'ghost' | 'filled' | 'tonal' = 'ghost'): CSSProperties {
  const base: CSSProperties = {
    border: 'none',
    borderRadius: CS.radiusMd,
    padding: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `all ${CS.transitionFast}`,
    fontFamily: CS.fontBody,
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: 1,
  };

  switch (variant) {
    case 'filled':
      return {
        ...base,
        background: CS.gradientPrimary,
        color: '#ffffff',
        boxShadow: '0 2px 8px rgba(43, 58, 125, 0.22)',
      };
    case 'tonal':
      return {
        ...base,
        background: CS.primarySoft,
        color: CS.primary,
      };
    default:
      return {
        ...base,
        background: 'transparent',
        color: CS.onSurfaceVariant,
      };
  }
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function csFormSelect(): CSSProperties {
  return {
    width: '100%',
    borderRadius: CS.radiusMd,
    padding: '10px 14px',
    border: `1px solid ${CS.outlineSubtle}`,
    background: CS.card,
    color: CS.onSurface,
    fontFamily: CS.fontBody,
    fontSize: '13px',
    transition: `border-color ${CS.transitionFast}`,
    outline: 'none',
    boxShadow: 'none',
  };
}

// ---------------------------------------------------------------------------
// Lists & rows
// ---------------------------------------------------------------------------

export function csConversationRow(selected: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: CS.radiusMd,
    padding: '10px 14px',
    background: selected ? CS.primarySoft : 'transparent',
    color: CS.onSurface,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: CS.fontBody,
    fontSize: '13px',
    transition: `all ${CS.transitionFast}`,
    boxShadow: selected ? `inset 3px 0 0 0 ${CS.primary}` : 'none',
    position: 'relative',
  };
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function csMetricTile(): CSSProperties {
  return {
    padding: '14px 16px',
    borderRadius: CS.radiusMd,
    background: CS.surfaceLow,
    border: `1px solid ${CS.outlineSubtle}`,
  };
}

export function csBadge(tone: 'good' | 'warning' | 'critical' | 'info' | 'neutral'): CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    good: { bg: CS.successSoft, fg: CS.success },
    warning: { bg: CS.warningSoft, fg: CS.warning },
    critical: { bg: CS.criticalSoft, fg: CS.critical },
    info: { bg: CS.infoSoft, fg: CS.info },
    neutral: { bg: CS.surfaceHigh, fg: CS.onSurfaceVariant },
  };
  const c = colors[tone] ?? colors.neutral!;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    borderRadius: CS.radiusFull,
    background: c!.bg,
    color: c!.fg,
    fontSize: '11px',
    fontWeight: 650,
    letterSpacing: '0.02em',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };
}

export function csStatusDot(color: string): CSSProperties {
  return {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    boxShadow: `0 0 0 3px ${color}22`,
  };
}

export function csAvatar(size: number = 32): CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: `${Math.round(size * 0.38)}px`,
    fontFamily: CS.fontDisplay,
    flexShrink: 0,
    letterSpacing: '-0.01em',
    textTransform: 'uppercase',
  };
}

// ---------------------------------------------------------------------------
// MiMo & specialized panels
// ---------------------------------------------------------------------------

export function csMiMoPanel(): CSSProperties {
  return {
    marginBottom: '12px',
    padding: '16px 18px',
    borderRadius: CS.radiusLg,
    background: CS.secondarySoft,
    border: `1px solid rgba(27, 123, 110, 0.10)`,
  };
}

// ---------------------------------------------------------------------------
// Active call layout
// ---------------------------------------------------------------------------

export function csActiveCallStage(): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 0,
    padding: '22px 26px',
    background: CS.surface,
  };
}

export function csVideoWell(): CSSProperties {
  return {
    position: 'relative',
    minHeight: 0,
    borderRadius: CS.radiusLg,
    overflow: 'hidden',
    background: '#0D0D10',
    boxShadow: CS.shadow3,
    border: `1px solid rgba(255, 255, 255, 0.05)`,
  };
}

export function csCallControlBar(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '12px 0',
  };
}

export function csCallControlButton(active: boolean, variant: 'default' | 'danger' = 'default'): CSSProperties {
  if (variant === 'danger') {
    return {
      border: 'none',
      borderRadius: CS.radiusFull,
      padding: '12px 28px',
      fontSize: '13px',
      fontWeight: 700,
      fontFamily: CS.fontBody,
      cursor: 'pointer',
      background: CS.gradientCritical,
      color: '#fff',
      boxShadow: '0 2px 12px rgba(192, 68, 68, 0.30)',
      transition: `all ${CS.transitionFast}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      letterSpacing: '0.01em',
    };
  }
  return {
    border: 'none',
    borderRadius: CS.radiusFull,
    padding: '12px 28px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: CS.fontBody,
    cursor: 'pointer',
    background: active ? 'rgba(255, 255, 255, 0.12)' : 'rgba(192, 68, 68, 0.75)',
    color: '#fff',
    transition: `all ${CS.transitionFast}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    letterSpacing: '0.01em',
  };
}

// ---------------------------------------------------------------------------
// Session tile (active call participant card)
// ---------------------------------------------------------------------------

export function csSessionTile(selected: boolean): CSSProperties {
  return {
    border: selected ? `1.5px solid ${CS.primary}33` : `1px solid ${CS.outlineSubtle}`,
    borderRadius: CS.radiusLg,
    padding: '16px 18px',
    background: selected ? CS.primarySoft : CS.card,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: CS.fontBody,
    transition: `all ${CS.transitionFast}`,
    boxShadow: selected ? CS.shadow2 : CS.shadow1,
  };
}

// ---------------------------------------------------------------------------
// Lobby overlay
// ---------------------------------------------------------------------------

export function csLobbyOverlay(): CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    position: 'relative',
    background: 'radial-gradient(ellipse at top, rgba(27, 123, 110, 0.12), rgba(13, 13, 16, 0.97) 70%)',
  };
}

export function csLobbyTitle(): CSSProperties {
  return {
    fontSize: '24px',
    fontWeight: 800,
    fontFamily: CS.fontDisplay,
    color: '#fff',
    letterSpacing: '-0.02em',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.35)',
  };
}

export function csLobbySubtitle(): CSSProperties {
  return {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.55)',
    fontWeight: 500,
  };
}

export function csLobbyJoinButton(): CSSProperties {
  return {
    border: 'none',
    borderRadius: CS.radiusFull,
    padding: '16px 52px',
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: CS.fontDisplay,
    cursor: 'pointer',
    background: CS.gradientSecondary,
    color: '#fff',
    boxShadow: '0 4px 20px rgba(27, 123, 110, 0.35)',
    transition: `all ${CS.transitionBase}`,
    letterSpacing: '-0.01em',
  };
}

// ---------------------------------------------------------------------------
// Utility: tone mapping
// ---------------------------------------------------------------------------

export function getToneForBadge(tone: CueTone): 'good' | 'warning' | 'critical' | 'info' {
  return tone;
}

type CueTone = 'good' | 'info' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Video tile grid (therapist 30-session dashboard)
// ---------------------------------------------------------------------------

export function csVideoTileGrid(compact: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: compact
      ? 'repeat(auto-fit, minmax(120px, 1fr))'
      : 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: compact ? '6px' : '10px',
    padding: compact ? '8px' : '0',
    overflowX: 'hidden',
    overflowY: compact ? 'auto' : 'hidden',
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    alignContent: compact ? 'start' : 'center',
  };
}

export function csVideoTile(selected: boolean, compact: boolean): CSSProperties {
  return {
    position: 'relative',
    borderRadius: compact ? CS.radius : CS.radiusMd,
    overflow: 'hidden',
    background: '#0D0D10',
    border: selected ? `2px solid ${CS.primary}` : `1px solid rgba(255, 255, 255, 0.08)`,
    cursor: 'pointer',
    aspectRatio: '4 / 3',
    transition: `border-color ${CS.transitionFast}, box-shadow ${CS.transitionFast}`,
    boxShadow: selected ? `0 0 0 2px ${CS.primary}44` : CS.shadow1,
  };
}

export function csVideoTileCanvas(): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };
}

export function csVideoTileOverlay(): CSSProperties {
  return {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '6px 8px',
    background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.7))',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '4px',
    pointerEvents: 'none',
  };
}

export function csVideoTileLabel(): CSSProperties {
  return {
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: CS.fontBody,
    textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  };
}

export function csVideoTileNoVideo(): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background: '#1A1A1E',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '11px',
    fontFamily: CS.fontBody,
  };
}

export function csSpotlightContainer(): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    minHeight: 0,
    gap: '0',
    flex: 1,
  };
}

export function csSpotlightMain(): CSSProperties {
  return {
    position: 'relative',
    minHeight: 0,
    minWidth: 0,
    borderRadius: CS.radiusLg,
    overflow: 'hidden',
    background: '#0D0D10',
    margin: '0 10px 0 0',
  };
}

export function csBannerWarning(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: CS.radiusMd,
    background: CS.warningSoft,
    border: `1px solid rgba(184, 112, 14, 0.2)`,
    color: CS.warning,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: CS.fontBody,
  };
}

export function csBannerInfo(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: CS.radiusMd,
    background: CS.infoSoft,
    border: `1px solid rgba(56, 104, 196, 0.22)`,
    color: CS.info,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: CS.fontBody,
  };
}

export function csPushToTalkButton(active: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: CS.radiusFull,
    padding: active ? '12px 24px' : '10px 20px',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: CS.fontBody,
    cursor: 'pointer',
    background: active ? CS.gradientSecondary : CS.gradientPrimary,
    color: '#fff',
    boxShadow: active
      ? '0 2px 16px rgba(27, 123, 110, 0.4)'
      : '0 2px 8px rgba(43, 58, 125, 0.22)',
    transition: `all ${CS.transitionFast}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    letterSpacing: '0.01em',
    transform: active ? 'scale(1.03)' : 'scale(1)',
  };
}

// Avatar color palette — warmer, nature-inspired tones
const AVATAR_COLORS = [
  { bg: '#E8EEE6', fg: '#2D5A45' },
  { bg: '#E5EDEC', fg: '#1B7B6E' },
  { bg: '#F0E5E8', fg: '#A04050' },
  { bg: '#F0EBE2', fg: '#8B6914' },
  { bg: '#E3EBF5', fg: '#2B3A7D' },
  { bg: '#EDE5F0', fg: '#6B3A80' },
  { bg: '#E5F0E8', fg: '#2D7A4E' },
  { bg: '#F5F0E2', fg: '#7A5C14' },
] as const;

export function getAvatarColor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return color ?? { bg: '#E8EEE6', fg: '#2D5A45' };
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`;
  }
  return name.slice(0, 2);
}
