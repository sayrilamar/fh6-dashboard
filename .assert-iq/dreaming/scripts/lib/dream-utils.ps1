# Shared helpers for the Assert.IQ Dreaming waking loop (PowerShell side).
# Dot-sourced by dream-record-session.ps1 and dream-gate.ps1; not run directly.

if (-not $env:AIQ_PACK_ROOT) {
    # .../.assert-iq/dreaming/scripts/lib -> repo root is four levels up.
    $env:AIQ_PACK_ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
}
$script:AiqPackRoot   = $env:AIQ_PACK_ROOT
$script:AiqMemoryDir  = if ($env:AIQ_MEMORY_DIR) { $env:AIQ_MEMORY_DIR } else { Join-Path $script:AiqPackRoot '.assert-iq\memory' }
$script:AiqDreamState = Join-Path $script:AiqMemoryDir '.dream\state.json'
$script:AiqConfig     = Join-Path $script:AiqPackRoot '.assert-iq\config.yaml'

New-Item -ItemType Directory -Force -Path (Join-Path $script:AiqMemoryDir '.dream') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $script:AiqMemoryDir 'logs') | Out-Null

function Aiq-EmitContinue { '{"continue":true}' }

function Aiq-Enabled {
    if ($env:AIQ_DREAMING_DISABLED -eq '1') { return $false }
    try {
        $txt = Get-Content -LiteralPath $script:AiqConfig -Raw -ErrorAction Stop
        if ($txt -match '(?ms)^dreaming:\s*$(.*?)(^\S|\Z)') {
            $block = $Matches[1]
            if ($block -match '(?m)^\s+enabled:\s*(true|false)') { return ($Matches[1] -ne 'false') }
        }
    } catch { }
    return $true
}

function Aiq-GateMinHours {
    if ($env:AIQ_DREAM_MIN_HOURS) { return [int]$env:AIQ_DREAM_MIN_HOURS }
    try {
        $m = Select-String -LiteralPath $script:AiqConfig -Pattern 'min_hours_between_dreams:\s*(\d+)' | Select-Object -First 1
        if ($m) { return [int]$m.Matches[0].Groups[1].Value }
    } catch { }
    return 24
}
function Aiq-GateMinSessions {
    if ($env:AIQ_DREAM_MIN_SESSIONS) { return [int]$env:AIQ_DREAM_MIN_SESSIONS }
    try {
        $m = Select-String -LiteralPath $script:AiqConfig -Pattern 'min_sessions_between_dreams:\s*(\d+)' | Select-Object -First 1
        if ($m) { return [int]$m.Matches[0].Groups[1].Value }
    } catch { }
    return 5
}

# Run a scriptblock while holding the cross-process dreaming state mutex.
function Aiq-WithStateLock {
    param([scriptblock]$Body)
    $mutex = New-Object System.Threading.Mutex($false, 'Global\AssertIQDreamingState')
    [void]$mutex.WaitOne()
    try { & $Body } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
}

function Aiq-ReadStdin { [Console]::In.ReadToEnd() }

function Aiq-JsonField {
    param([string]$Raw, [string[]]$Names)
    try {
        $o = $Raw | ConvertFrom-Json -ErrorAction Stop
        foreach ($n in $Names) { if ($o.$n) { return [string]$o.$n } }
    } catch { }
    return ''
}
