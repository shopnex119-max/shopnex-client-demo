[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$Version = '0.2.0'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stage = Join-Path $env:TEMP ("shopnex-update-" + [guid]::NewGuid().ToString('N'))
$BackupRoot = $null

function Stop-Update([string]$Message) {
    Write-Host "`nخطأ: $Message" -ForegroundColor Red
    if ($BackupRoot) { Write-Host "النسخة الاحتياطية: $BackupRoot" -ForegroundColor Yellow }
    throw $Message
}
function Test-Project([string]$Path) {
    return ((Test-Path (Join-Path $Path 'scripts\run-api.ps1')) -or (Test-Path (Join-Path $Path 'services\api\requirements.txt'))) -and
           (Test-Path (Join-Path $Path 'apps\desktop\src-tauri\tauri.conf.json')) -and
           (Test-Path (Join-Path $Path 'services\api\requirements.txt'))
}
function Find-Payload([string]$Name, [string]$ReleaseFolder) {
    $direct = Join-Path $ScriptDir $Name
    if (Test-Path -LiteralPath $direct) { return $direct }
    if ($ReleaseFolder -and (Test-Path -LiteralPath $ReleaseFolder)) {
        $found = Get-ChildItem -LiteralPath $ReleaseFolder -File -Recurse -Filter $Name | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}
function Copy-Backup([string]$Path, [string]$RelativePath) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $destination = Join-Path $BackupRoot $RelativePath
        $parent = Split-Path -Parent $destination
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        Copy-Item -LiteralPath $Path -Destination $destination -Force
    }
}

try {
    if ($env:OS -ne 'Windows_NT') { Stop-Update 'هذا الملف خاص بـWindows.' }
    Write-Host "محدّث SHOPNEX ULTIMATE لويندوز — الإصدار $Version" -ForegroundColor Cyan

    $ProjectRoot = $null
    $Candidates = @(
        $ScriptDir,
        (Join-Path $ScriptDir 'shopnex-desktop'),
        (Join-Path (Split-Path -Parent $ScriptDir) 'shopnex-desktop')
    )
    foreach ($candidate in $Candidates) {
        if (Test-Project $candidate) { $ProjectRoot = (Resolve-Path -LiteralPath $candidate).Path; break }
    }
    if (-not $ProjectRoot) {
        Stop-Update 'ضع الملف بجوار ملفات التحديث داخل جذر مجلد المشروع الذي يحتوي على apps\desktop وservices\api. لا تضعه في مجلد تثبيت البرنامج داخل Program Files.'
    }

    New-Item -ItemType Directory -Path $Stage -Force | Out-Null
    $ReleaseZip = Join-Path $ScriptDir "SHOPNEX-ULTIMATE-$Version-Windows.zip"
    $ReleaseFolder = $null
    if (Test-Path -LiteralPath $ReleaseZip) {
        $ReleaseFolder = Join-Path $Stage 'release'
        Expand-Archive -LiteralPath $ReleaseZip -DestinationPath $ReleaseFolder -Force
    }

    $Installer = $null
    $Installer = Get-ChildItem -LiteralPath $ScriptDir -File -Filter "*${Version}*setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Installer -and $ReleaseFolder) {
        $Installer = Get-ChildItem -LiteralPath $ReleaseFolder -File -Filter "*${Version}*setup.exe" -Recurse | Select-Object -First 1
    }
    if (-not $Installer) {
        Stop-Update 'لم أجد مُثبت Windows بصيغة setup.exe. ملف .deb الخاص بلينكس لا يعمل على ويندوز؛ نزّل حزمة SHOPNEX Windows الكاملة.'
    }

    $SourceZip = Find-Payload "SHOPNEX-ULTIMATE-source-$Version-Windows.zip" $ReleaseFolder
    $SourceRoot = $null
    if ($SourceZip) {
        $SourceFolder = Join-Path $Stage 'source'
        Expand-Archive -LiteralPath $SourceZip -DestinationPath $SourceFolder -Force
        $candidateSource = Join-Path $SourceFolder 'shopnex-desktop'
        if (Test-Project $candidateSource) { $SourceRoot = $candidateSource }
    }
    if (-not $SourceRoot) {
        $directSource = Join-Path $ScriptDir 'shopnex-desktop'
        if (Test-Project $directSource) { $SourceRoot = $directSource }
    }
    if (-not $SourceRoot) { Stop-Update 'لم أجد مصدر Windows المحدّث أو ملف SHOPNEX-ULTIMATE-source-0.2.0-Windows.zip.' }

    if (Get-Process -Name 'shopnex-desktop' -ErrorAction SilentlyContinue) {
        Stop-Update 'أغلق SHOPNEX المفتوح ثم شغّل المحدّث مرة أخرى. لم يتم استبدال ملفات البرنامج.'
    }
    $ApiListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ApiListener) { Stop-Update 'أوقف API المحلي على المنفذ 8000 (اضغط Ctrl+C في نافذته) ثم أعد تشغيل المحدّث.' }

    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupRoot = Join-Path $ProjectRoot "backups\shopnex-before-$Version-$Stamp"
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    Copy-Backup (Join-Path $ProjectRoot '.env') '.env'
    Copy-Backup (Join-Path $ProjectRoot 'services\api\.env') 'services\api\.env'
    Copy-Backup (Join-Path $ProjectRoot 'services\api\.secret-key') 'services\api\.secret-key'
    Copy-Backup (Join-Path $ProjectRoot 'scripts\run-api.ps1') 'scripts\run-api.ps1'

    $DatabaseUrl = $env:DATABASE_URL
    if (-not $DatabaseUrl) {
        foreach ($envFile in @((Join-Path $ProjectRoot '.env'), (Join-Path $ProjectRoot 'services\api\.env'))) {
            if (Test-Path -LiteralPath $envFile) {
                foreach ($line in Get-Content -LiteralPath $envFile) {
                    if ($line -match '^\s*DATABASE_URL\s*=\s*(.*)$') { $DatabaseUrl = $Matches[1].Trim().Trim('"').Trim("'") }
                }
            }
        }
    }
    if (-not $DatabaseUrl) { $DatabaseUrl = 'sqlite:///./shopnex-dev.db' }
    if ($DatabaseUrl -match '^sqlite(?:\+pysqlite)?:///') {
        $relative = $DatabaseUrl -replace '^sqlite(?:\+pysqlite)?:///', ''
        $relative = ($relative -split '\?')[0] -replace '/', '\'
        if ($relative -match '^\\?([A-Za-z]:\\.*)$') { $DatabasePath = $Matches[1] }
        elseif ([IO.Path]::IsPathRooted($relative)) { $DatabasePath = $relative }
        else { $DatabasePath = Join-Path (Join-Path $ProjectRoot 'services\api') $relative }
        if (Test-Path -LiteralPath $DatabasePath -PathType Leaf) {
            Copy-Backup $DatabasePath (Join-Path 'database' ([IO.Path]::GetFileName($DatabasePath)))
        }
    }

    Write-Host "نسخة احتياطية أُنشئت في: $BackupRoot" -ForegroundColor Green
    Write-Host 'جارٍ استبدال ملفات المصدر المحدّثة دون حذف ملفاتك...'
    & robocopy $SourceRoot $ProjectRoot /E /COPY:DAT /R:1 /W:1 /XJ /XD .venv node_modules dist target /XF .env .secret-key | Out-Null
    $CopyCode = $LASTEXITCODE
    if ($CopyCode -gt 7) { Stop-Update "تعذر نسخ ملفات المصدر (robocopy code $CopyCode)." }

    Write-Host 'جارٍ تثبيت تحديث Windows... قد تظهر نافذة صلاحيات النظام.'
    $InstallerProcess = Start-Process -FilePath $Installer.FullName -ArgumentList '/S' -Wait -PassThru
    if ($InstallerProcess.ExitCode -ne 0) { Stop-Update "فشل مُثبت Windows برمز $($InstallerProcess.ExitCode)." }

    $RunApi = Join-Path $ProjectRoot 'scripts\run-api.ps1'
    if (-not (Test-Path -LiteralPath $RunApi)) { Stop-Update 'تم تثبيت الواجهة لكن ملف تشغيل API لويندوز غير موجود.' }
    Write-Host 'جارٍ تجهيز API وتطبيق ترحيل قاعدة البيانات... قد يستغرق أول تشغيل عدة دقائق.'
    $PowerShellExe = (Get-Command 'powershell.exe' -ErrorAction Stop).Source
    & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $RunApi -MigrateOnly
    if ($LASTEXITCODE -ne 0) { Stop-Update 'فشل ترحيل قاعدة البيانات. راجع Python والإعدادات، واحتفظ بالنسخة الاحتياطية.' }

    Write-Host "`nتم تحديث SHOPNEX إلى الإصدار $Version بنجاح." -ForegroundColor Green
    Write-Host "النسخة الاحتياطية: $BackupRoot"
    Write-Host 'لتشغيل البرنامج لاحقًا، افتح اختصار SHOPNEX ULTIMATE على سطح المكتب أو شغّل .\scripts\start-shopnex.bat.'
    if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') { Read-Host 'اضغط Enter للإغلاق' | Out-Null }
}
catch {
    Write-Host "`nلم يكتمل التحديث: $($_.Exception.Message)" -ForegroundColor Red
    if ($BackupRoot) { Write-Host "النسخة الاحتياطية ما زالت محفوظة في: $BackupRoot" -ForegroundColor Yellow }
    if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') { Read-Host 'اضغط Enter للإغلاق' | Out-Null }
    exit 1
}
finally {
    if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
}
