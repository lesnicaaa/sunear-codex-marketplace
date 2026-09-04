#!/bin/sh
set -eu

release_base="https://github.com/lesnicaaa/sunear-codex-marketplace/releases/download/v0.1.7"
platform="$(uname -s)"
architecture="$(uname -m)"
case "${platform}:${architecture}" in
  Darwin:arm64)
    archive="sunear-codex-receiver-darwin-arm64.gz"
    expected_sha256="7575e87d1ee386754c672433268e26fae4447e873e3d9b6098f203fd97e8b4a6"
    ;;
  Darwin:x86_64)
    archive="sunear-codex-receiver-darwin-x64.gz"
    expected_sha256="17935dd5bdff1c7361f690bb94bb9b1ada405e6cd07c5f74ec900d11775e976c"
    ;;
  Linux:aarch64|Linux:arm64)
    archive="sunear-codex-receiver-linux-arm64.gz"
    expected_sha256="3633a8bf271c7b01eb49154f19159da6f532d73229d1e2f48b2a8b836b3ae62e"
    ;;
  Linux:x86_64)
    archive="sunear-codex-receiver-linux-x64.gz"
    expected_sha256="7311d42704d720f6de8f31147a767decb876a767ed4b1ad0ce49edb594f3f815"
    ;;
  *) echo "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: ${platform}:${architecture}" >&2; exit 1 ;;
esac

install_dir="${PLUGIN_DATA}/bin"
executable="${install_dir}/sunear-codex-receiver-0.7.3"
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
