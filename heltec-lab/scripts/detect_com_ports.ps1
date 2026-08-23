# PowerShell Script: Detect Heltec ESP32 COM Ports on Windows
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " 🔍 Scanning Windows System for Heltec COM Ports" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

$ports = Get-CimInstance -ClassName Win32_SerialPort | Select-Object DeviceID, Name, Description

if ($null -eq $ports -or $ports.Count -eq 0) {
    # Fallback to PnP devices scan if Win32_SerialPort doesn't catch virtual USB ports
    $pnpPorts = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' }
    if ($pnpPorts) {
        foreach ($dev in $pnpPorts) {
            $isHeltec = ($dev.Name -match "CP210" -or $dev.Name -match "CH340" -or $dev.Name -match "USB Serial" -or $dev.Name -match "ESP32")
            if ($isHeltec) {
                Write-Host "✅ FOUND HELTEC/ESP32 DEVICE:" -ForegroundColor Green
                Write-Host "   Name: $($dev.Name)" -ForegroundColor Yellow
                Write-Host "   Status: $($dev.Status)" -ForegroundColor White
            } else {
                Write-Host "🔌 Other Serial Device: $($dev.Name)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ No active COM ports detected. Please connect your Heltec board via USB." -ForegroundColor Red
    }
} else {
    foreach ($p in $ports) {
        Write-Host "🔌 Port: $($p.DeviceID) | Name: $($p.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
