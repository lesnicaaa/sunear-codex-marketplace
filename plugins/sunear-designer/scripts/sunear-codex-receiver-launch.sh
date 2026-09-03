#!/bin/sh
set -eu

platform="$(uname -s)"
architecture="$(uname -m)"
case "${platform}:${architecture}" in
  Darwin:arm64) archive="sunear-codex-receiver-darwin-arm64.gz" ;;
  Darwin:x86_64) archive="sunear-codex-receiver-darwin-x64.gz" ;;
  Linux:aarch64|Linux:arm64) archive="sunear-codex-receiver-linux-arm64.gz" ;;
  Linux:x86_64) archive="sunear-codex-receiver-linux-x64.gz" ;;
  *) echo "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: ${platform}:${architecture}" >&2; exit 1 ;;
esac

install_dir="${PLUGIN_DATA}/bin"
executable="${install_dir}/sunear-codex-receiver-0.5.0"
if [ ! -x "${executable}" ]; then
  mkdir -p "${install_dir}"
  temporary="${executable}.tmp.$$"
  trap 'rm -f "${temporary}"' EXIT HUP INT TERM
  gzip -dc "${PLUGIN_ROOT}/bin/${archive}" > "${temporary}"
  chmod 700 "${temporary}"
  mv "${temporary}" "${executable}"
  trap - EXIT HUP INT TERM
fi
exec "${executable}" "$@"
