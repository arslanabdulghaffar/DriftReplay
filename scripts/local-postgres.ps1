param([ValidateSet('status', 'start', 'stop')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archive = Join-Path $project '.local\postgres-downloads\postgresql-17.11-5-windows-x64-binaries.zip'
$runtime = Join-Path $project '.local\postgres-17.11-5\pgsql'
$cluster = Join-Path $project '.local\postgres-test'
$data = Join-Path $cluster 'data'
# Operate only the previously authorized disposable workspace cluster. No download,
# installation, service registration, PATH change or data removal occurs here.
function Assert-SafePath([string]$Path) {
  $candidate = [IO.Path]::GetFullPath($Path)
  if (-not $candidate.StartsWith($project + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'POSTGRES_UNSAFE_LOCAL_PATH'
  }
  while ($candidate) {
    if ([IO.File]::GetAttributes($candidate) -band [IO.FileAttributes]::ReparsePoint) {
      throw 'POSTGRES_UNSAFE_LOCAL_PATH'
    }
    $candidate = [IO.Path]::GetDirectoryName($candidate)
  }
}
foreach ($path in @($archive, $runtime, $cluster, $data)) { Assert-SafePath $path }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f') {
  throw 'POSTGRES_ARCHIVE_VERIFICATION_FAILED'
}
# Verify extracted runtime bytes too; an unchanged ZIP cannot authorize modified DLLs.
$expected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  foreach ($entry in $zip.Entries) {
    if (-not $entry.FullName.StartsWith('pgsql/') -or $entry.FullName.EndsWith('/')) { continue }
    $relative = $entry.FullName.Substring(6)
    $target = [IO.Path]::GetFullPath((Join-Path $runtime $relative))
    if (-not $target.StartsWith($runtime + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $expected.Add($target)) {
      throw 'POSTGRES_UNSAFE_ARCHIVE_PATH'
    }
    Assert-SafePath $target
    $item = [IO.FileInfo]::new($target)
    if (($item.Attributes -band [IO.FileAttributes]::Directory) -or $item.Length -ne $entry.Length) { throw 'POSTGRES_RUNTIME_VERIFICATION_FAILED' }
    $stream = $entry.Open()
    try { $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
    finally { $stream.Dispose() }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $digest) {
      throw 'POSTGRES_RUNTIME_VERIFICATION_FAILED'
    }
  }
  if ($expected.Count -eq 0) { throw 'POSTGRES_EMPTY_RUNTIME' }
  foreach ($item in Get-ChildItem -LiteralPath $runtime -Force -Recurse) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'POSTGRES_UNSAFE_LOCAL_PATH' }
    if (-not $item.PSIsContainer -and -not $expected.Contains($item.FullName)) { throw 'POSTGRES_UNEXPECTED_RUNTIME_FILE' }
  }
} finally { $zip.Dispose() }
function Assert-LoopbackListener {
  $pidFile = Join-Path $data 'postmaster.pid'
  Assert-SafePath $pidFile
  $serverPid = [int](Get-Content -LiteralPath $pidFile -TotalCount 1)
  $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $serverPid -ErrorAction Stop)
  if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].LocalPort -ne 54329) {
    throw 'POSTGRES_UNSAFE_LISTENER'
  }
}
$control = Join-Path $runtime 'bin\pg_ctl.exe'
if ($Action -eq 'start') {
  & $control -D $data -l (Join-Path $cluster 'postgres.log') -o '-c listen_addresses=127.0.0.1 -c port=54329' -w start
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  try { Assert-LoopbackListener }
  catch {
    & $control -D $data -m fast -w stop
    throw 'POSTGRES_LISTENER_CHECK_FAILED_SERVER_STOPPED'
  }
} elseif ($Action -eq 'stop') {
  Assert-LoopbackListener
  & $control -D $data -m fast -w stop
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  & $control -D $data status
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Assert-LoopbackListener
}
Write-Output "Verified runtime files: $($expected.Count); action: $Action"
