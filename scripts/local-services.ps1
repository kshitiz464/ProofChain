param(
    [ValidateSet('Start', 'Restart', 'Stop')]
    [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'backend\data\local-startup'
$stateFile = Join-Path $runtime 'processes.json'
$frontendUrl = 'http://127.0.0.1:5173'
$apiUrl = 'http://127.0.0.1:5000'
$managed = @()
$started = @()

function Get-ManagedProcess($record) {
    $process = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToFileTimeUtc().ToString() -eq $record.Created) {
        return $process
    }
}

function Stop-ManagedServices {
    foreach ($record in $managed) {
        $process = Get-ManagedProcess $record
        if ($process) {
            $process.Kill()
            if (-not $process.WaitForExit(5000)) {
                throw "Timed out stopping $($record.Name)."
            }
        }
    }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
    $script:managed = @()
}

function Start-ServiceProcess($name, $folder, $entry, $arguments) {
    $outputLog = Join-Path $runtime "$name.log"
    $errorLog = Join-Path $runtime "$name.error.log"
    $process = Start-Process -FilePath $node -ArgumentList ('"{0}" {1}' -f $entry, $arguments) `
        -WorkingDirectory $folder -WindowStyle Hidden -RedirectStandardOutput $outputLog `
        -RedirectStandardError $errorLog -PassThru
    $script:started += $process
    $script:managed += [pscustomobject]@{
        Name = $name
        Id = $process.Id
        Created = $process.StartTime.ToFileTimeUtc().ToString()
    }
    ConvertTo-Json -InputObject $managed | Set-Content -LiteralPath $stateFile -Encoding UTF8
    return $process
}

function Wait-Ready($name, $process, $probe) {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        if ($process.HasExited) {
            throw "$name exited with code $($process.ExitCode). See $runtime for its logs."
        }
        try {
            if (& $probe) { return }
        } catch {
            # A service can refuse requests while it is still starting.
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "$name did not become ready. See $runtime for its logs."
}

function Test-Api($url) {
    $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3
    return $health.contract.ready -eq $true
}

function Show-Ready {
    Write-Host "ProofChain is ready at $frontendUrl"
    Write-Host "Service logs: $runtime"
    Write-Host 'Use 3_STOP_ALL.bat to stop the local services.'
    if ($env:PROOFCHAIN_NO_BROWSER -ne '1') {
        try { Start-Process $frontendUrl }
        catch { Write-Host "Open $frontendUrl in your browser." }
    }
}

# Serialize launcher actions for this checkout so two clicks cannot deploy twice.
$sha = [System.Security.Cryptography.SHA256]::Create()
$rootHash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-', '')
$sha.Dispose()
$mutex = New-Object System.Threading.Mutex($false, "Local\ProofChain-$rootHash")
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another ProofChain launcher action is already running.' }

    if (Test-Path -LiteralPath $stateFile) {
        $records = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
        $managed = @($records)
    }
    if ($Action -eq 'Stop') {
        Stop-ManagedServices
        Write-Host 'ProofChain local services stopped.'
        return
    }
    if ($Action -eq 'Restart') { Stop-ManagedServices }

    $live = @($managed | Where-Object { Get-ManagedProcess $_ })
    if ($live.Count -gt 0) {
        $ready = $false
        if ($live.Count -eq 3) {
            try {
                $page = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 3
                $ready = $page.StatusCode -eq 200 -and (Test-Api $frontendUrl)
            } catch {}
        }
        if (-not $ready) { throw 'The previous local stack is incomplete. Run 2_QUICK_RESTART.bat.' }
        Show-Ready
        return
    }

    $occupied = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in 8545, 5000, 5173 })
    if ($occupied.Count -gt 0) {
        $ports = ($occupied.LocalPort | Sort-Object -Unique) -join ', '
        throw "Port(s) $ports are already in use. Close the old Hardhat, API or frontend window using those ports, then try again."
    }

    $node = (Get-Command node.exe).Source
    $blockchain = Join-Path $root 'blockchain'
    $backend = Join-Path $root 'backend'
    $frontend = Join-Path $root 'frontend'
    $hardhat = Join-Path $blockchain 'node_modules\hardhat\internal\cli\bootstrap.js'
    $vite = Join-Path $frontend 'node_modules\vite\bin\vite.js'
    foreach ($dependency in @($hardhat, $vite, (Join-Path $backend 'node_modules\express\package.json'))) {
        if (-not (Test-Path -LiteralPath $dependency)) { throw 'Dependencies are missing. Run 0_INSTALL_FIRST_TIME.bat.' }
    }

    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $managed = @()
    $env:HARDHAT_DISABLE_TELEMETRY_PROMPT = 'true'
    Write-Host '[1/4] Starting the local blockchain...'
    $chain = Start-ServiceProcess 'hardhat' $blockchain $hardhat 'node --hostname 127.0.0.1'
    Wait-Ready 'Hardhat' $chain {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8545' -Method Post -ContentType 'application/json' `
            -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 2
        $response.result -eq '0x7a69'
    }

    Write-Host '[2/4] Deploying the ProofChain contract...'
    Push-Location -LiteralPath $blockchain
    try {
        & $node $hardhat run scripts/deploy.js --network localhost
        if ($LASTEXITCODE -ne 0) { throw 'Contract deployment failed. See the output above.' }
    } finally { Pop-Location }

    Write-Host '[3/4] Starting the API and checking the deployed contract...'
    $env:ENV_FILE = Join-Path $backend '.env'
    $env:PORT = '5000'
    $env:BIND_HOST = '127.0.0.1'
    $api = Start-ServiceProcess 'api' $backend (Join-Path $backend 'src\app.js') ''
    Wait-Ready 'API' $api { Test-Api $apiUrl }

    Write-Host '[4/4] Starting the frontend and checking its API connection...'
    $ui = Start-ServiceProcess 'frontend' $frontend $vite '--host 127.0.0.1 --port 5173 --strictPort'
    Wait-Ready 'Frontend' $ui {
        $page = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 3
        $page.StatusCode -eq 200 -and (Test-Api $frontendUrl)
    }
    Show-Ready
} catch {
    Write-Host "ProofChain startup error: $($_.Exception.Message)" -ForegroundColor Red
    if ($started.Count -gt 0) {
        try { Stop-ManagedServices }
        catch { Write-Host "Could not stop a local service: $($_.Exception.Message)" }
    }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
