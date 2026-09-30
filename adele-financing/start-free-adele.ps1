$ErrorActionPreference = 'Continue'

# Restore the saved adele app after Windows starts.
$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (Test-Path -LiteralPath $pm2) {
    $appPid = (& $pm2 pid adele 2>$null | Out-String).Trim()
    if (-not $appPid -or $appPid -eq '0') {
        & $pm2 resurrect 2>&1 | Out-Null
    }
}

# Start a Cloudflare quick tunnel only if this app's tunnel is not already running.
$cloudflared = Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'
if (Test-Path -LiteralPath $cloudflared) {
    $existing = @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'tunnel\s+--url\s+http://localhost:4000' })
    if ($existing.Count -eq 0) {
        $outLog = Join-Path $env:TEMP 'adele-free-tunnel.out.log'
        $errLog = Join-Path $env:TEMP 'adele-free-tunnel.err.log'
        Start-Process -FilePath $cloudflared `
            -ArgumentList @('tunnel','--url','http://localhost:4000','--no-autoupdate') `
            -RedirectStandardOutput $outLog `
            -RedirectStandardError $errLog `
            -WindowStyle Hidden | Out-Null
    }
}
