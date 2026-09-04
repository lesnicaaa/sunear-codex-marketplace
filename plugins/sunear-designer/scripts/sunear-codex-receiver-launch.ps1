$ErrorActionPreference = "Stop"
if ($env:PROCESSOR_ARCHITECTURE -notin @("AMD64", "ARM64")) {
  throw "SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED: Windows/$env:PROCESSOR_ARCHITECTURE"
}
$installDirectory = Join-Path $env:PLUGIN_DATA "bin"
$executable = Join-Path $installDirectory "sunear-codex-receiver-0.7.2.exe"
if (-not (Test-Path $executable)) {
  New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
  $archive = Join-Path $env:PLUGIN_ROOT "bin/sunear-codex-receiver-windows-x64.exe.gz"
  $temporary = "$executable.tmp.$PID"
  try {
    $input = [System.IO.File]::OpenRead($archive)
    $gzip = New-Object System.IO.Compression.GZipStream($input, [System.IO.Compression.CompressionMode]::Decompress)
    $output = [System.IO.File]::Create($temporary)
    $gzip.CopyTo($output)
    $output.Dispose()
    $gzip.Dispose()
    $input.Dispose()
    Move-Item -Force $temporary $executable
  } finally {
    if (Test-Path $temporary) { Remove-Item -Force $temporary }
  }
}
& $executable @args
exit $LASTEXITCODE
