# Shared helper: render session-events.template.json with __PACK_ROOT__
# substituted for an absolute path. Dot-sourced by install.ps1 and bootstrap.ps1.


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

function Render-EventsTemplate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Template,
        [Parameter(Mandatory)] [string] $Out,
        [Parameter(Mandatory)] [string] $PackRoot
    )
    if (-not (Test-Path -LiteralPath $Template)) {
        throw "render-events: template not found: $Template"
    }
    $escaped = $PackRoot.Replace('\', '\\').Replace('"', '\"')
    $rendered = (Get-Content -LiteralPath $Template -Raw).Replace('__PACK_ROOT__', $escaped)
    Write-AiqUtf8 -Path $Out -Value $rendered -NoNewline
}
