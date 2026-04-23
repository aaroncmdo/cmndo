# Test: signiert einen Webhook-Request selbst und feuert ihn auf die Prod-URL.
# Beweist, ob unsere Secret-Verifikation an sich funktioniert.
#
# Aufruf: powershell -ExecutionPolicy Bypass -File scripts\test-lexdrive-inbound.ps1
#
# Liest den Secret aus .env.local, damit er NICHT im Git-Verlauf landet.

$ErrorActionPreference = 'Stop'

# --- Secret aus .env.local laden ---------------------------------------
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
if (-not (Test-Path $envPath)) {
  throw ".env.local nicht gefunden unter $envPath"
}
$line = Select-String -Path $envPath -Pattern '^LEXDRIVE_WEBHOOK_SECRET=' | Select-Object -First 1
if (-not $line) {
  throw "LEXDRIVE_WEBHOOK_SECRET nicht in .env.local gefunden"
}
$Secret = ($line.Line -split '=', 2)[1].Trim()

$Url = 'https://cmndo.vercel.app/api/webhooks/lexdrive'

# Body EXAKT so wie Sertac ihn schickt
$Body = '{"datum":"2026-04-23T00:00:00.000Z","fall_nr":"TEST-2026-04-23-b3f0702d","event_id":"ld-evt-selftest-001","event_type":"vollmacht_bestaetigt"}'

# HMAC-SHA256 über den Raw-Body, Hex lowercase
$keyBytes  = [System.Text.Encoding]::UTF8.GetBytes($Secret)
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
$hmac      = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
$sigBytes  = $hmac.ComputeHash($bodyBytes)
$sigHex    = -join ($sigBytes | ForEach-Object { $_.ToString('x2') })

Write-Host "URL:       $Url"
Write-Host "Body:      $Body"
Write-Host "Signature: sha256=$sigHex"
Write-Host ""

try {
  $resp = Invoke-WebRequest `
    -Method POST `
    -Uri $Url `
    -Headers @{
        'Content-Type'         = 'application/json'
        'X-Lexdrive-Signature' = "sha256=$sigHex"
      } `
    -Body $Body `
    -SkipHttpErrorCheck
  Write-Host "Status: $($resp.StatusCode)"
  Write-Host "Body:   $($resp.Content)"
} catch {
  Write-Host "ERROR: $_"
}
