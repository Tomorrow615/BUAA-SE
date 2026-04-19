$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
    Write-Host "No recorded dev processes."
}
else {
    Write-Host "Recorded dev processes:"
    foreach ($entry in $state.processes) {
        $alive = $null -ne (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)
        $status = if ($alive) { "running" } else { "stopped" }

        if ($alive -and $entry.name -eq "backend-worker") {
            $childPython = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.ParentProcessId -eq $entry.pid -and $_.Name -like "python*.exe"
                } |
                Select-Object -First 1
            if ($null -eq $childPython) {
                $status = "running (waiting/retrying)"
            }
        }

        Write-Host ("- {0} | PID {1} | {2}" -f $entry.name, $entry.pid, $status)
    }
}

Write-Host ""
Write-Host "Ports:"
foreach ($port in 5173, 5174, 8000) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    $status = if ($connections) { "listening" } else { "not listening" }
    Write-Host ("- {0}: {1}" -f $port, $status)
}
