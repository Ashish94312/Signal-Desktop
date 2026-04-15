#!/usr/bin/env bash
# Copyright 2026 Signal Messenger, LLC
# SPDX-License-Identifier: AGPL-3.0-only

set -euo pipefail

EXPECTED_NODE_VERSION="24.14.0"
EXPECTED_PNPM_VERSION="10.18.1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

log() {
  echo "[bootstrap] $*"
}

fail() {
  echo "[bootstrap] ERROR: $*" >&2
  exit 1
}

run_pnpm() {
  if [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
    arch -arm64 pnpm "$@"
    return
  fi

  pnpm "$@"
}

verify_fs_xattr_arch() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi

  xattr_node_path="$(ls node_modules/.pnpm/fs-xattr@*/node_modules/fs-xattr/build/Release/xattr.node 2>/dev/null | head -n 1 || true)"
  if [[ -z "${xattr_node_path}" ]]; then
    log "fs-xattr binary not found (optional dependency may be skipped on this platform)."
    return 0
  fi

  xattr_archs="$(lipo -archs "${xattr_node_path}" 2>/dev/null || true)"
  if [[ "$(uname -m)" == "arm64" ]] && [[ "${xattr_archs}" != *"arm64"* ]]; then
    log "Detected fs-xattr architecture mismatch: ${xattr_archs:-unknown}"
    return 1
  fi

  log "Verified fs-xattr architecture: ${xattr_archs:-unknown}"
  return 0
}

if [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]] && [[ "$(arch)" != "arm64" ]]; then
  fail "Rosetta shell detected (arch=$(arch)). Open a native arm64 terminal and rerun."
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. Install Node ${EXPECTED_NODE_VERSION} and rerun."
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm is not available. Install pnpm ${EXPECTED_PNPM_VERSION} and rerun."
fi

current_node_version="$(node -p "process.versions.node")"
if [[ "${current_node_version}" != "${EXPECTED_NODE_VERSION}" ]]; then
  if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
    log "Switching Node to ${EXPECTED_NODE_VERSION} using nvm"
    # shellcheck disable=SC1090
    source "${HOME}/.nvm/nvm.sh"
    nvm install "${EXPECTED_NODE_VERSION}" >/dev/null
    nvm use "${EXPECTED_NODE_VERSION}" >/dev/null
    hash -r
    current_node_version="$(node -p "process.versions.node")"
  fi

  if [[ "${current_node_version}" != "${EXPECTED_NODE_VERSION}" ]]; then
    fail "Expected Node ${EXPECTED_NODE_VERSION}, found ${current_node_version}. Switch Node and rerun."
  fi
fi

current_node_arch="$(node -p "process.arch")"
if [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]] && [[ "${current_node_arch}" != "arm64" ]]; then
  fail "Node is ${current_node_arch} on an arm64 Mac. Use native arm64 Node and rerun."
fi

current_pnpm_version="$(pnpm --version)"
if [[ "${current_pnpm_version}" != "${EXPECTED_PNPM_VERSION}" ]] && command -v corepack >/dev/null 2>&1; then
  log "Activating pnpm@${EXPECTED_PNPM_VERSION} via corepack"
  corepack prepare "pnpm@${EXPECTED_PNPM_VERSION}" --activate
  hash -r
  current_pnpm_version="$(pnpm --version)"
fi

if [[ "${current_pnpm_version}" != "${EXPECTED_PNPM_VERSION}" ]]; then
  fail "Expected pnpm ${EXPECTED_PNPM_VERSION}, found ${current_pnpm_version}."
fi

log "Using Node ${current_node_version} (${current_node_arch}), pnpm ${current_pnpm_version}"
log "Installing workspace dependencies"
run_pnpm install --frozen-lockfile

log "Rebuilding Electron native dependencies"
run_pnpm run electron:install-app-deps

if ! verify_fs_xattr_arch; then
  log "Resetting node_modules and reinstalling to recover from architecture drift"
  rm -rf node_modules
  run_pnpm install --force --frozen-lockfile
  run_pnpm run electron:install-app-deps

  if ! verify_fs_xattr_arch; then
    fail "fs-xattr architecture is still incompatible after reinstall."
  fi
fi

log "Bootstrap complete. You can now run: pnpm run start:prod"
