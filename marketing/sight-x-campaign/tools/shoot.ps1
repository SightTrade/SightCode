param(
  [string]$Url,
  [string]$Out,
  [int]$Width = 1600,
  [int]$Height = 900,
  [int]$WaitMs = 20000
)
# Screenshot helper: Chrome headless=new, unique profile dir, --timeout forces
# capture after the real wait even when SSE/streams keep the page loading.
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = Join-Path $env:TEMP ("chrome-shots-" + [System.Guid]::NewGuid().ToString("N").Substring(0,8))
$timer = [System.Diagnostics.Stopwatch]::StartNew()
& $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --user-data-dir=$profileDir --window-size=$Width,$Height --screenshot=$Out `
  --timeout=$WaitMs $Url 2>&1 | Out-Null
$timer.Stop()
if (Test-Path $Out) {
  Write-Output ("OK " + $Out + " (" + [math]::Round($timer.Elapsed.TotalSeconds,1) + "s)")
} else {
  Write-Output ("FAIL " + $Out)
}

