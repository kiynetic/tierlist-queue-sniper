param(
    [string]$Target = "All"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $Root "dist"
$PackagedDir = Join-Path $DistDir "qPilot-win32-x64"
$PackageJson = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$Version = $PackageJson.version
$PortableZip = Join-Path $DistDir "qPilot-v$Version-win-x64-portable.zip"
$InstallerExe = Join-Path $DistDir "qPilot-v$Version-Setup.exe"

$IsccPath = $null
$CandidatePaths = @(
    "ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)
foreach ($p in $CandidatePaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) {
        $IsccPath = (Get-Command $p).Source
        break
    } elseif (Test-Path $p) {
        $IsccPath = $p
        break
    }
}

Get-Process -Name qPilot -ErrorAction SilentlyContinue | Stop-Process -Force

if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

Write-Host "Packaging electron app..." -ForegroundColor Cyan
Push-Location $Root
npx electron-packager . qPilot --platform=win32 --arch=x64 --out=dist --overwrite --icon=src/assets/icon.ico --asar --ignore="^/\.qpilot_data" --ignore="^/dist" --ignore="^/\.git" --prune=true
Pop-Location

if ($Target -eq "Portable" -or $Target -eq "All") {
    Write-Host "Creating portable archive..." -ForegroundColor Cyan
    if (Test-Path $PortableZip) { Remove-Item $PortableZip -Force }
    tar.exe -a -c -f $PortableZip -C $PackagedDir .
    Write-Host "Portable build complete: $PortableZip" -ForegroundColor Green
}

if ($Target -eq "Installer" -or $Target -eq "All") {
    Write-Host "Compiling Inno Setup installer..." -ForegroundColor Cyan
    if (-not $IsccPath) {
        throw "Inno Setup compiler (ISCC.exe) not found."
    }
    if (Test-Path $InstallerExe) { Remove-Item $InstallerExe -Force }
    $IssFile = Join-Path $Root "build\installer.iss"
    & $IsccPath $IssFile
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to compile Inno Setup installer"
    }
    Write-Host "Installer build complete: $InstallerExe" -ForegroundColor Green
}
