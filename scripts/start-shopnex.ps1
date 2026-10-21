$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RunApi = Join-Path $PSScriptRoot 'run-api.ps1'

function Test-ShopnexApiPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', 8000, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Find-ShopnexExecutable {
    $programRoots = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
    )
    $shell = New-Object -ComObject WScript.Shell
    foreach ($root in $programRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        $shortcuts = Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like '*SHOPNEX*' }
        foreach ($shortcut in $shortcuts) {
            try {
                $target = $shell.CreateShortcut($shortcut.FullName).TargetPath
                if ($target -and (Test-Path -LiteralPath $target -PathType Leaf)) { return $target }
            } catch { }
        }
    }

    $uninstallRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($root in $uninstallRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($key in (Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
            try {
                $entry = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction Stop
                if ([string]$entry.DisplayName -notlike '*SHOPNEX*') { continue }
                $candidates = @()
                if ($entry.DisplayIcon) {
                    $iconPath = (([string]$entry.DisplayIcon) -replace ',\d+$', '').Trim('"')
                    $candidates += $iconPath
                }
                if ($entry.InstallLocation) {
                    $candidates += (Join-Path ([string]$entry.InstallLocation) 'shopnex-desktop.exe')
                }
                foreach ($candidate in $candidates) {
                    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
                }
            } catch { }
        }
    }

    $knownPaths = @(
        (Join-Path $env:LOCALAPPDATA 'SHOPNEX ULTIMATE\shopnex-desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\SHOPNEX ULTIMATE\shopnex-desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\shopnex-desktop\shopnex-desktop.exe')
    )
    foreach ($candidate in $knownPaths) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'هذا المشغّل مخصص لـWindows.' }
    if (-not (Test-Path -LiteralPath $RunApi -PathType Leaf)) { throw 'ملف تشغيل API غير موجود داخل مجلد scripts.' }

    if (-not (Test-ShopnexApiPort)) {
        Write-Host 'جارٍ تشغيل خدمة SHOPNEX API في نافذة منفصلة...'
        $arguments = '-NoProfile -ExecutionPolicy Bypass -NoExit -File "' + $RunApi + '"'
        Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Normal | Out-Null
        $ready = $false
        for ($i = 0; $i -lt 90; $i++) {
            Start-Sleep -Seconds 1
            if (Test-ShopnexApiPort) { $ready = $true; break }
        }
        if (-not $ready) { throw 'لم تبدأ API خلال 90 ثانية. راجع نافذة PowerShell المنفصلة؛ اتركها مفتوحة بعد نجاح التشغيل.' }
    }

    $AppExecutable = Find-ShopnexExecutable
    if (-not $AppExecutable) { throw 'تم تشغيل API، لكن لم أجد اختصار SHOPNEX أو ملف البرنامج. افتح SHOPNEX ULTIMATE يدويًا من قائمة Start.' }
    Start-Process -FilePath $AppExecutable
    Write-Host 'تم تشغيل SHOPNEX. اترك نافذة API مفتوحة أثناء استخدام البرنامج.' -ForegroundColor Green
} catch {
    Write-Host "`nتعذر تشغيل SHOPNEX: $($_.Exception.Message)" -ForegroundColor Red
    if ($Host.Name -eq 'ConsoleHost') { Read-Host 'اضغط Enter للإغلاق' | Out-Null }
    exit 1
}
