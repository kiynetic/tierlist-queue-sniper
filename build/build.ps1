param(
    [string]$Target = "All"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $Root "dist"
$PackagedDir = Join-Path $DistDir "qPilot-win32-x64"
$PortableZip = Join-Path $DistDir "qPilot-v1.0.0-win-x64-portable.zip"
$InstallerExe = Join-Path $DistDir "qPilot-v1.0.0-Setup.exe"
$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

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
    Write-Host "Compiling setup installer..." -ForegroundColor Cyan
    if (Test-Path $InstallerExe) { Remove-Item $InstallerExe -Force }
    $outArg = "/out:$InstallerExe"
    $iconArg = "/win32icon:" + (Join-Path $Root "src\assets\icon.ico")
    $resArg = "/resource:$PortableZip,qpilot_payload"
    $sourceFile = Join-Path $Root "build\Installer.cs"
    & $CscPath /target:winexe /optimize+ $outArg $iconArg $resArg /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll $sourceFile
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to compile setup installer"
    }
    Write-Host "Installer build complete: $InstallerExe" -ForegroundColor Green
}
