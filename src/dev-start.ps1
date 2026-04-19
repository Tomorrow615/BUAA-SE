param(
    [switch]$WithAdmin,
    [switch]$WithWorker,
    [switch]$NoWorker,
    [switch]$InitDb,
    [switch]$SkipDocker,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RuntimeRoot = Join-Path $env:TEMP "business-research-platform-dev"
$script:StateFile = Join-Path $script:RuntimeRoot "state.json"
$script:PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$script:NpmCmd = Join-Path ${env:ProgramFiles} "nodejs\npm.cmd"

New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null

function Get-State {
    if (-not (Test-Path $script:StateFile)) {
        return $null
    }

    return Get-Content -Encoding UTF8 -Raw $script:StateFile | ConvertFrom-Json
}

function Get-LiveProcesses($state) {
    if ($null -eq $state -or $null -eq $state.processes) {
        return @()
    }

    $live = @()
    foreach ($entry in $state.processes) {
        if ($null -ne (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) {
            $live += $entry
        }
    }
    return $live
}

function Assert-PathExists([string]$path, [string]$message) {
    if (-not (Test-Path $path)) {
        throw $message
    }
}

function New-EncodedCommand([string]$scriptText) {
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($scriptText)
    return [Convert]::ToBase64String($bytes)
}

function Start-ServiceWindow([hashtable]$service) {
    $serviceScript = @"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$Host.UI.RawUI.WindowTitle = '$($service.title)'
Set-Location '$($service.workdir.Replace("'", "''"))'
$($service.command)
"@

    if ($DryRun) {
        Write-Host ("[DryRun] Start {0} in {1}" -f $service.name, $service.workdir)
        Write-Host ("         {0}" -f $service.command)
        return @{
            name = $service.name
            pid = 0
            workdir = $service.workdir
        }
    }

    $process = Start-Process `
        -FilePath $script:PowerShellExe `
        -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            (New-EncodedCommand $serviceScript)
        ) `
        -WorkingDirectory $service.workdir `
        -PassThru

    return @{
        name = $service.name
        pid = $process.Id
        workdir = $service.workdir
    }
}

function Invoke-DockerUp {
    if ($SkipDocker) {
        Write-Host "Skip Docker startup."
        return
    }

    if ($DryRun) {
        Write-Host "[DryRun] docker compose up -d postgres redis"
        return
    }

    Push-Location $script:ProjectRoot
    try {
        docker compose up -d postgres redis
    }
    finally {
        Pop-Location
    }
}

function Invoke-InitDb {
    if (-not $InitDb) {
        return
    }

    $apiDir = Join-Path $script:ProjectRoot "backend-api"
    $pythonExe = Join-Path $apiDir ".venv\Scripts\python.exe"
    $alembicExe = Join-Path $apiDir ".venv\Scripts\alembic.exe"

    Assert-PathExists $pythonExe "backend-api virtualenv was not found."
    Assert-PathExists $alembicExe "alembic.exe was not found in backend-api .venv."

    if ($DryRun) {
        Write-Host "[DryRun] backend-api migration and seed"
        return
    }

    Push-Location $apiDir
    try {
        & $alembicExe -c alembic.ini upgrade head
        & $pythonExe .\scripts\seed_initial_data.py
    }
    finally {
        Pop-Location
    }
}

$existingState = Get-State
$liveProcesses = Get-LiveProcesses $existingState
if ($liveProcesses.Count -gt 0) {
    Write-Host "Existing dev processes were found:"
    foreach ($entry in $liveProcesses) {
        Write-Host ("- {0} (PID {1})" -f $entry.name, $entry.pid)
    }
    Write-Host "Run .\dev-stop.cmd first if you want a clean restart."
    exit 1
}

$apiPython = Join-Path $script:ProjectRoot "backend-api\.venv\Scripts\python.exe"
$workerPython = Join-Path $script:ProjectRoot "backend-worker\.venv\Scripts\python.exe"
$startWorker = $WithWorker -or (-not $NoWorker)

Assert-PathExists $script:PowerShellExe "powershell.exe was not found."
Assert-PathExists $script:NpmCmd "npm.cmd was not found. Please install Node.js."
Assert-PathExists $apiPython "backend-api virtualenv was not found."
if ($startWorker) {
    Assert-PathExists $workerPython "backend-worker virtualenv was not found."
}

Invoke-DockerUp
Invoke-InitDb

$services = @(
    @{
        name = "backend-api"
        title = "business-research | backend-api"
        workdir = (Join-Path $script:ProjectRoot "backend-api")
        command = "& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
    },
    @{
        name = "frontend-user"
        title = "business-research | frontend-user"
        workdir = (Join-Path $script:ProjectRoot "frontend-user")
        command = "& '$($script:NpmCmd.Replace("'", "''"))' run dev"
    }
)

if ($WithAdmin) {
    $services += @{
        name = "frontend-admin"
        title = "business-research | frontend-admin"
        workdir = (Join-Path $script:ProjectRoot "frontend-admin")
        command = "& '$($script:NpmCmd.Replace("'", "''"))' run dev"
    }
}

if ($startWorker) {
    $services += @{
        name = "backend-worker"
        title = "business-research | backend-worker"
        workdir = (Join-Path $script:ProjectRoot "backend-worker")
        command = @"
while (`$true) {
    try {
        & '.\.venv\Scripts\python.exe' -m research_worker.main --worker-name dev-worker
    }
    catch {
        Write-Host ("backend-worker crashed: {0}" -f `$_.Exception.Message)
    }

    Write-Host "backend-worker will retry in 5 seconds..."
    Start-Sleep -Seconds 5
}
"@
    }
}

$started = @()
foreach ($service in $services) {
    $started += Start-ServiceWindow $service
}

if (-not $DryRun) {
    $statePayload = @{
        started_at = (Get-Date).ToString("s")
        project_root = $script:ProjectRoot
        processes = $started
    }
    $statePayload | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $script:StateFile
}

Write-Host ""
Write-Host "Dev environment is ready."
Write-Host "- User frontend: http://127.0.0.1:5173"
Write-Host "- Backend API: http://127.0.0.1:8000"
if ($WithAdmin) {
    Write-Host "- Admin frontend: http://127.0.0.1:5174"
}
if ($startWorker) {
    Write-Host "- Worker: running"
}
Write-Host ""
Write-Host "Examples:"
Write-Host "- .\dev-start.cmd"
Write-Host "- .\dev-start.cmd -WithWorker"
Write-Host "- .\dev-start.cmd -NoWorker"
Write-Host "- .\dev-start.cmd -WithAdmin -WithWorker -InitDb"
Write-Host "- .\dev-stop.cmd"
