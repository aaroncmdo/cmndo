# Test: signiert einen Webhook-Request selbst und feuert ihn auf die Prod-URL.
# Beweist, ob unsere Secret-Verifikation an sich funktioniert.
#
# Aufruf: powershell -ExecutionPolicy Bypass -File scripts\test-lexdrive-inbound.ps1

$ErrorActionPreference = 'Stop'

$Secret = '26061943365089b2acc51e583fbf1af7bb92a3832228c7f5ebc43260cb47e195'
$Url    = 'https://cmndo.vercel.app/api/webhooks/lexdrive'

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
