#!/bin/sh
set -eu

platform="$(uname -s)"
architecture="$(uname -m)"
case "${platform}:${architecture}" in
  Darwin:arm64)
    archive="sunear-codex-receiver-darwin-arm64.gz"
    expected_sha256="7575e87d1ee386754c672433268e26fae4447e873e3d9b6098f203fd97e8b4a6"
    release_tag="v0.1.7"
    receiver_version="0.7.3"
    ;;
  *) echo "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: ${platform}:${architecture}" >&2; exit 1 ;;
esac

install_dir="${PLUGIN_DATA}/bin"
release_base="https://github.com/lesnicaaa/sunear-codex-marketplace/releases/download/${release_tag}"
executable="${install_dir}/sunear-codex-receiver-${receiver_version}"
if [ ! -x "${executable}" ] && [ "${1:-}" = "session-end" ]; then exit 0; fi
if [ ! -x "${executable}" ]; then
  command -v curl >/dev/null 2>&1 || { echo "SUNEAR_RECEIVER_DOWNLOADER_MISSING: curl" >&2; exit 1; }
  mkdir -p "${install_dir}"
  chmod 700 "${install_dir}"
  archive_temporary="$(mktemp "${install_dir}/.sunear-receiver-archive.XXXXXX")"
  executable_temporary="$(mktemp "${install_dir}/.sunear-receiver-executable.XXXXXX")"
  trap 'rm -f "${archive_temporary}" "${executable_temporary}"' EXIT HUP INT TERM
  curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 \
    --output "${archive_temporary}" "${release_base}/${archive}"
  if command -v shasum >/dev/null 2>&1; then
    actual_sha256="$(shasum -a 256 "${archive_temporary}" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual_sha256="$(sha256sum "${archive_temporary}" | awk '{print $1}')"
  else
    echo "SUNEAR_RECEIVER_CHECKSUM_TOOL_MISSING" >&2
    exit 1
  fi
  if [ "${actual_sha256}" != "${expected_sha256}" ]; then
    echo "SUNEAR_RECEIVER_ARCHIVE_CHECKSUM_MISMATCH" >&2
    exit 1
  fi
  gzip -dc "${archive_temporary}" > "${executable_temporary}"
  chmod 700 "${executable_temporary}"
  mv "${executable_temporary}" "${executable}"
  rm -f "${archive_temporary}"
  trap - EXIT HUP INT TERM
fi
exec "${executable}" "$@"
