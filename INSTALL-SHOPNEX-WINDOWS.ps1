$ErrorActionPreference = 'Stop'
Write-Host 'هذا مُثبّت قديم ينسخ ملفات المصدر ويحتاج Python/إنترنت؛ لا تستخدمه لتسليم نسخة تجارية.' -ForegroundColor Red
Write-Host 'ابنِ الحزمة الرسمية من GitHub Actions: Windows offline desktop package، ثم وزّع ملف *-setup.exe فقط.' -ForegroundColor Yellow
exit 1
$Version = '0.2.0'
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stage = Join-Path $env:TEMP ("shopnex-install-" + [guid]::NewGuid().ToString('N'))
$ProjectRoot = $null

function Test-ShopnexProject([string]$Path) {
    return (Test-Path -LiteralPath (Join-Path $Path 'apps\desktop\src-tauri\tauri.conf.json')) -and
           (Test-Path -LiteralPath (Join-Path $Path 'services\api\requirements.txt'))
}
function Copy-Payload([string]$Source, [string]$Destination) {
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}
function New-DesktopLauncher([string]$Root) {
    $StartScript = Join-Path $Root 'scripts\start-shopnex.ps1'
    if (-not (Test-Path -LiteralPath $StartScript -PathType Leaf)) {
        Write-Host 'لم أجد مشغّل البدء؛ يمكنك فتح البرنامج من قائمة Start وتشغيل scripts\run-api.ps1.' -ForegroundColor Yellow
        return
    }
    try {
        $Desktop = [Environment]::GetFolderPath('Desktop')
        $ShortcutPath = Join-Path $Desktop 'SHOPNEX ULTIMATE.lnk'
        $Shell = New-Object -ComObject WScript.Shell
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = (Get-Command 'powershell.exe' -ErrorAction Stop).Source
        $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $StartScript + '"'
        $Shortcut.WorkingDirectory = $Root
        $Shortcut.Description = 'تشغيل SHOPNEX ULTIMATE والـAPI المحلية'
        $Shortcut.Save()
        Write-Host "أُنشئ اختصار التشغيل على سطح المكتب: $ShortcutPath" -ForegroundColor Green
    } catch {
        Write-Host 'تعذر إنشاء اختصار سطح المكتب تلقائيًا؛ ملف التشغيل موجود في scripts\start-shopnex.bat.' -ForegroundColor Yellow
    }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'هذا المثبّت مخصص لـWindows فقط.' }

    $Installer = Get-ChildItem -LiteralPath $PackageRoot -File -Filter "*${Version}*setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $SourceZip = Join-Path $PackageRoot "SHOPNEX-ULTIMATE-source-$Version-Windows.zip"
    $Updater = Join-Path $PackageRoot "update-shopnex-$Version.ps1"
    if (-not $Installer) { throw 'لم أجد مُثبت Windows setup.exe. فك ضغط الحزمة الكاملة أولًا ثم شغّل INSTALL-SHOPNEX-WINDOWS.bat.' }
    if (-not (Test-Path -LiteralPath $SourceZip -PathType Leaf)) { throw 'ملف مصدر Windows غير موجود داخل الحزمة.' }
    if (-not (Test-Path -LiteralPath $Updater -PathType Leaf)) { throw 'سكربت التحديث غير موجود داخل الحزمة.' }

    if (Test-ShopnexProject $PackageRoot) {
        $ProjectRoot = (Resolve-Path -LiteralPath $PackageRoot).Path
        Write-Host "وجدت مجلد المشروع الحالي؛ سيتم تحديثه مع إنشاء نسخة احتياطية: $ProjectRoot" -ForegroundColor Cyan
    }

    if (-not $ProjectRoot) {
        $KnownProject = Join-Path $env:LOCALAPPDATA 'SHOPNEX-ULTIMATE\shopnex-desktop'
        if (Test-ShopnexProject $KnownProject) { $ProjectRoot = $KnownProject }
    }

    if (-not $ProjectRoot) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $Picker = New-Object System.Windows.Forms.FolderBrowserDialog
            $Picker.Description = 'اختر مجلد SHOPNEX القديم الذي يحتوي على apps\desktop وservices\api لحفظ بياناته، أو اضغط إلغاء لتثبيت نسخة جديدة دون لمس الملفات القديمة.'
            $Picker.ShowNewFolderButton = $false
            if ($Picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                if (-not (Test-ShopnexProject $Picker.SelectedPath)) {
                    throw 'المجلد المختار لا يبدو مجلد مصدر SHOPNEX؛ يجب أن يحتوي على apps\desktop وservices\api.'
                }
                $ProjectRoot = (Resolve-Path -LiteralPath $Picker.SelectedPath).Path
            }
        } catch {
            if ($_.Exception.Message -like 'المجلد المختار*') { throw }
        }
    }

    if (-not $ProjectRoot) {
        $InstallBase = Join-Path $env:LOCALAPPDATA 'SHOPNEX-ULTIMATE'
        $ProjectRoot = Join-Path $InstallBase 'shopnex-desktop'
        if ((Test-Path -LiteralPath $ProjectRoot) -and -not (Test-ShopnexProject $ProjectRoot)) {
            $ProjectRoot = Join-Path $InstallBase ("shopnex-desktop-$Version-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        }
        New-Item -ItemType Directory -Path $InstallBase -Force | Out-Null
        New-Item -ItemType Directory -Path $Stage -Force | Out-Null
        Write-Host 'جارٍ تجهيز ملفات البرنامج في مجلد المستخدم؛ الملفات القديمة خارج هذا المجلد لن تُحذف.' -ForegroundColor Cyan
        Expand-Archive -LiteralPath $SourceZip -DestinationPath $Stage -Force
        $ExtractedSource = Join-Path $Stage 'shopnex-desktop'
        if (-not (Test-ShopnexProject $ExtractedSource)) { throw 'ملف مصدر Windows تالف أو لا يحتوي على ملفات البرنامج المطلوبة.' }
        New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null
        & robocopy $ExtractedSource $ProjectRoot /E /COPY:DAT /R:1 /W:1 /XJ /XD .venv node_modules dist target | Out-Null
        $CopyCode = $LASTEXITCODE
        if ($CopyCode -gt 7) { throw "تعذر تجهيز ملفات البرنامج (robocopy code $CopyCode)." }
    }

    if (-not (Test-ShopnexProject $ProjectRoot)) { throw 'لم أتمكن من تحديد مجلد مشروع صالح.' }

    if ($ProjectRoot -ne $PackageRoot) {
        Copy-Payload $Installer.FullName (Join-Path $ProjectRoot $Installer.Name)
        Copy-Payload $SourceZip (Join-Path $ProjectRoot (Split-Path -Leaf $SourceZip))
        Copy-Payload $Updater (Join-Path $ProjectRoot (Split-Path -Leaf $Updater))
    }

    $ProjectUpdater = Join-Path $ProjectRoot "update-shopnex-$Version.ps1"
    $Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $ProjectUpdater + '" -NoPause'
    Write-Host 'جارٍ تثبيت SHOPNEX وتجهيز قاعدة البيانات. اترك النافذة مفتوحة...' -ForegroundColor Cyan
    $UpdateProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $Arguments -Wait -PassThru -NoNewWindow
    if ($UpdateProcess.ExitCode -ne 0) { throw 'لم يكتمل التثبيت أو التحديث. احتفظ بالنسخة الاحتياطية الظاهرة أعلاه.' }

    New-DesktopLauncher $ProjectRoot
    $StartScript = Join-Path $ProjectRoot 'scripts\start-shopnex.ps1'
    if (Test-Path -LiteralPath $StartScript -PathType Leaf) {
        Write-Host 'جارٍ تشغيل API والبرنامج لأول مرة...' -ForegroundColor Cyan
        $StartArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $StartScript + '"'
        $StartProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $StartArguments -Wait -PassThru -NoNewWindow
        if ($StartProcess.ExitCode -ne 0) {
            Write-Host 'تم التثبيت، لكن التشغيل التلقائي لم يكتمل. استخدم اختصار SHOPNEX ULTIMATE على سطح المكتب.' -ForegroundColor Yellow
        }
    }

    Write-Host "`nاكتمل تثبيت SHOPNEX ULTIMATE 0.2.0. مجلد البيانات والمشروع: $ProjectRoot" -ForegroundColor Green
    Write-Host 'للمرات القادمة، شغّل SHOPNEX من اختصار سطح المكتب. ستبقى نافذة API مفتوحة أثناء الاستخدام.'
    if ($Host.Name -eq 'ConsoleHost') { Read-Host 'اضغط Enter للإغلاق' | Out-Null }
} catch {
    Write-Host "`nلم يكتمل التثبيت: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'لم يحذف المثبّت ملفات المشروع أو قاعدة البيانات القديمة.' -ForegroundColor Yellow
    if ($Host.Name -eq 'ConsoleHost') { Read-Host 'اضغط Enter للإغلاق' | Out-Null }
    exit 1
} finally {
    if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
}
