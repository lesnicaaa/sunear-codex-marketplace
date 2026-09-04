$ErrorActionPreference = "Stop"
if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  throw "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: Windows/$env:PROCESSOR_ARCHITECTURE"
}

$archive = "sunear-codex-receiver-windows-x64.exe.gz"
$expectedSha256 = "6b9e51fab29e117f71ee76522ca358d74c1d7663d3d0e25c97e4e5aa864277d2"
$downloadUrl = "https://github.com/lesnicaaa/sunear-codex-marketplace/releases/download/v0.1.8/$archive"
$installDirectory = Join-Path $env:PLUGIN_DATA "bin"
$executable = Join-Path $installDirectory "sunear-codex-receiver-0.7.4.exe"
if ((-not (Test-Path $executable)) -and $args.Count -gt 0 -and $args[0] -eq "session-end") { exit 0 }
if (-not (Test-Path $executable)) {
  New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
  $archiveTemporary = Join-Path $installDirectory ".sunear-receiver.$([Guid]::NewGuid().ToString('N')).gz"
  $executableTemporary = Join-Path $installDirectory ".sunear-receiver.$([Guid]::NewGuid().ToString('N')).exe"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archiveTemporary -UseBasicParsing
    $actualSha256 = (Get-FileHash -Path $archiveTemporary -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) { throw "SUNEAR_RECEIVER_ARCHIVE_CHECKSUM_MISMATCH" }
    $input = [System.IO.File]::OpenRead($archiveTemporary)
    try {
      $gzip = New-Object System.IO.Compression.GZipStream($input, [System.IO.Compression.CompressionMode]::Decompress)
      try {
        $output = [System.IO.File]::Create($executableTemporary)
        try { $gzip.CopyTo($output) } finally { $output.Dispose() }
      } finally { $gzip.Dispose() }
    } finally { $input.Dispose() }
    Move-Item -Force $executableTemporary $executable
  } finally {
    if (Test-Path $archiveTemporary) { Remove-Item -Force $archiveTemporary }
    if (Test-Path $executableTemporary) { Remove-Item -Force $executableTemporary }
  }
}
& $executable @args
exit $LASTEXITCODE
