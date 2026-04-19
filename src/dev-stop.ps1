param(
    [switch]$StopDocker,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RuntimeRoot = Join-Path $env:TEMP "business-research-platform-dev"
$script:StateFile = Join-Path $script:RuntimeRoot "state.json"

function Get-State {
    if (-not (Test-Path $script:StateFile)) {
        return $null
    }

    return Get-Content -Encoding UTF8 -Raw $script:StateFile | ConvertFrom-Json
}

$state = Get-State
if ($null -eq $state -or $null -eq $state.processes) {
    Write-Host "No recorded dev processes were found."
}
else {
    foreach ($entry in $state.processes) {
        $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            Write-Host ("Skip {0}, PID {1} is already gone." -f $entry.name, $entry.pid)
            continue
        }

        if ($DryRun) {
            Write-Host ("[DryRun] Stop {0} (PID {1})" -f $entry.name, $entry.pid)
            continue
        }

        Stop-Process -Id $entry.pid -Force
        Write-Host ("Stopped {0} (PID {1})" -f $entry.name, $entry.pid)
    }
}

if ((Test-Path $script:StateFile) -and (-not $DryRun)) {
    Remove-Item -LiteralPath $script:StateFile -Force
}

if ($StopDocker) {
    if ($DryRun) {
        Write-Host "[DryRun] docker compose stop postgres redis"
    }
    else {
        Push-Location $script:ProjectRoot
        try {
            docker compose stop postgres redis
        }
        finally {
            Pop-Location
        }
        Write-Host "Stopped postgres and redis containers."
    }
}
