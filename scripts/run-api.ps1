[CmdletBinding()]
param(
    [switch]$MigrateOnly
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ApiRoot = Join-Path $ProjectRoot 'services\api'
$VenvPython = Join-Path $ApiRoot '.venv\Scripts\python.exe'

function Import-ShopnexEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

if ($env:OS -ne 'Windows_NT') { throw 'This script is for Windows only.' }
Import-ShopnexEnv (Join-Path $ProjectRoot '.env')

$PythonCommand = Get-Command 'py' -ErrorAction SilentlyContinue
$PythonPrefix = @('-3')
if (-not $PythonCommand) {
    $PythonCommand = Get-Command 'python' -ErrorAction SilentlyContinue
    $PythonPrefix = @()
}
if (-not $PythonCommand) {
    throw 'Python 3 is required. Install Python 3.11 or 3.12 and enable Add Python to PATH, then run this script again.'
}
$PythonExe = $PythonCommand.Source

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host 'Creating the local Python environment...'
    & $PythonExe @PythonPrefix -m venv (Join-Path $ApiRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the API virtual environment.' }
    & $VenvPython -m pip install -r (Join-Path $ApiRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Could not install API requirements. Check the Internet connection and Python installation.' }
}

if ([string]::IsNullOrWhiteSpace($env:APP_SECRET) -or $env:APP_SECRET -like 'replace-with-*' -or $env:APP_SECRET -like 'development-only*') {
    $SecretFile = Join-Path $ApiRoot '.secret-key'
    if (-not (Test-Path -LiteralPath $SecretFile) -or [string]::IsNullOrWhiteSpace((Get-Content -LiteralPath $SecretFile -Raw -ErrorAction SilentlyContinue))) {
        $Secret = & $VenvPython -c 'import secrets; print(secrets.token_hex(32))'
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the local application secret.' }
        Set-Content -LiteralPath $SecretFile -Value $Secret -Encoding ASCII
    }
    $env:APP_SECRET = (Get-Content -LiteralPath $SecretFile -Raw).Trim()
}

Push-Location $ApiRoot
try {
    Write-Host 'Applying local database migrations...'
    & $VenvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    if ($MigrateOnly) {
        Write-Host 'SHOPNEX database migration completed.' -ForegroundColor Green
        exit 0
    }
    Write-Host 'Starting SHOPNEX API at http://127.0.0.1:8000 (keep this window open).'
    & $VenvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
    if ($LASTEXITCODE -ne 0) { throw 'SHOPNEX API stopped with an error.' }
}
finally {
    Pop-Location
}
