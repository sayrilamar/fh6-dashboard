# Waking loop (session end): increment the session counter and append a
# one-line, dated note to today's daily log. Never blocks the agent.
$ErrorActionPreference = 'SilentlyContinue'

# UTF-8 WITHOUT BOM, ON EVERY HOST.
#
# `Set-Content -Encoding UTF8` writes a byte-order mark on Windows PowerShell
# 5.1; PowerShell 7's UTF8 means UTF-8 *without* BOM. The pack's Python tooling
# reads JSON with encoding="utf-8", which REJECTS a BOM
# (json.JSONDecodeError: Expecting value: line 1 column 1), so on a stock
# Windows box every JSON file written here -- dream state, verdicts, the install
# manifest, .claude/settings.json -- became unparseable to calibration.py,
# memory-sanity.py, the verdict recorder and dreaming_service.py. The
# `-Encoding utf8NoBOM` value that would fix this exists only in PowerShell 6+,
# so write through .NET instead. Semantics match Set-Content: an array is joined
# with newlines and a trailing newline is added unless -NoNewline is given.
$script:AiqUtf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-AiqUtf8 {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter()][AllowEmptyString()][AllowNull()] $Value,
        [switch] $NoNewline,
        [switch] $Append
    )
    if ($null -eq $Value) { $Value = @() }
    # Order matters. A [string] is itself IEnumerable (of chars), so it must be
    # tested FIRST. And the collection test must be IEnumerable, not
    # [System.Array]: several callers pass a
    # System.Collections.Generic.List[string], which is NOT an array. Getting
    # that wrong sent a List down the [string] cast, which joins with $OFS -- a
    # SPACE -- collapsing .git/info/exclude into a single line so git matched
    # nothing and trial mode silently stopped hiding anything.
    if ($Value -is [string]) {
        $text = $Value
    } elseif ($Value -is [System.Collections.IEnumerable]) {
        $text = (@($Value) | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    } else {
        $text = [string]$Value
    }
    if (-not $NoNewline -and $text.Length -ge 0) { $text += [Environment]::NewLine }
    if ($Append) {
        [System.IO.File]::AppendAllText($Path, $text, $script:AiqUtf8NoBom)
    } else {
        [System.IO.File]::WriteAllText($Path, $text, $script:AiqUtf8NoBom)
    }
}

. (Join-Path $PSScriptRoot 'lib\dream-utils.ps1')

if (-not (Aiq-Enabled)) { Aiq-EmitContinue; return }

$raw = Aiq-ReadStdin
$sid = Aiq-JsonField -Raw $raw -Names @('session_id','sessionId'); if (-not $sid) { $sid = 'unknown' }
$transcript = Aiq-JsonField -Raw $raw -Names @('transcript_path','transcriptPath')

Aiq-WithStateLock {
    $st = [pscustomobject]@{ last_dream_utc = $null; sessions_since_dream = 0 }
    try { if (Test-Path -LiteralPath $script:AiqDreamState) { $st = Get-Content -LiteralPath $script:AiqDreamState -Raw | ConvertFrom-Json } } catch { }
    $count = 0; if ($st.sessions_since_dream) { $count = [int]$st.sessions_since_dream }
    $out = [ordered]@{ last_dream_utc = $st.last_dream_utc; sessions_since_dream = $count + 1 }
    Write-AiqUtf8 -Path $script:AiqDreamState -Value ($out | ConvertTo-Json)
}

$now = (Get-Date).ToUniversalTime()
$day = $now.ToString('yyyy-MM-dd'); $y = $now.ToString('yyyy'); $m = $now.ToString('MM')
$logDir = Join-Path $script:AiqMemoryDir "logs\$y\$m"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "$day.md"
if (-not (Test-Path -LiteralPath $logFile)) { Write-AiqUtf8 -Path $logFile -Value "# Daily log $day`n" }
$ts = $now.ToString('yyyy-MM-ddTHH:mm:ss')
$line = if ($transcript) { "- ${ts}Z session $sid ended (transcript: $transcript)" } else { "- ${ts}Z session $sid ended" }
Write-AiqUtf8 -Path $logFile -Value $line -Append

Aiq-EmitContinue
