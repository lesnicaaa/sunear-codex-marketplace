$ErrorActionPreference = "Stop"
if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  throw "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: Windows/$env:PROCESSOR_ARCHITECTURE"
}

$archive = "sunear-codex-receiver-windows-x64.exe.gz"
$expectedSha256 = "039e3a51103caa14eb748823bd44cc8cf72fabe9c138df85eaa6677e11d2dabd"
$downloadUrl = "https://github.com/lesnicaaa/sunear-codex-marketplace/releases/download/v0.1.13/$archive"
$installDirectory = Join-Path $env:PLUGIN_DATA "bin"
$executable = Join-Path $installDirectory "sunear-codex-receiver-0.8.0.exe"
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
