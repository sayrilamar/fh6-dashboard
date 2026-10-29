# Session start: if the dual gate is met (>= min_hours AND >= min_sessions
# since the last dream), surface a nudge to run /dream. Never blocks.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'lib\dream-utils.ps1')

if (-not (Aiq-Enabled)) { Aiq-EmitContinue; return }

$minH = Aiq-GateMinHours
$minS = Aiq-GateMinSessions

$st = $null
try { if (Test-Path -LiteralPath $script:AiqDreamState) { $st = Get-Content -LiteralPath $script:AiqDreamState -Raw | ConvertFrom-Json } } catch { }
$sessions = 0; if ($st.sessions_since_dream) { $sessions = [int]$st.sessions_since_dream }
$last = if ($st) { $st.last_dream_utc } else { $null }

$sessionsOk = $sessions -ge $minS
$timeOk = $true
if ($last) {
    try { $timeOk = ((Get-Date).ToUniversalTime() - [datetime]::Parse($last).ToUniversalTime()).TotalHours -ge $minH } catch { $timeOk = $true }
}

if ($sessionsOk -and $timeOk) {
    $msg = "Assert.IQ Dreaming: $sessions sessions since the last consolidation (gate: $minS sessions AND ${minH}h). Consider running /dream to consolidate memory."
    @{ continue = $true; systemMessage = $msg } | ConvertTo-Json -Compress
} else {
    Aiq-EmitContinue
}
