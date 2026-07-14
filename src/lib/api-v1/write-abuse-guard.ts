import 'server-only'
import { countRecentMcpLeadsByPhone, countRecentGegnerLeadsByPhone } from './recent-lead-dedup'

// Abuse-Haertung fuer die oeffentliche Write-API (POST /api/v1/melde-schaden + /rueckruf),
// sobald sie breit an externe KI-Assistenten (ChatGPT/Claude/Gemini) geht.
//
// Kernproblem: fremde KI-Calls kommen von den Egress-IPs der Plattform (OpenAI/Anthropic),
// NICHT vom Endnutzer. Damit ist der bestehende Per-IP-Limit (10/min) als alleiniges Gate
// untauglich — er ist (a) umgehbar via IP-Rotation UND (b) false-positive fuer legitimen
// Traffic, der sich wenige Plattform-IPs teilt (ein Bucket -> echte Nutzer werden geblockt).
// Zusaetzlich: jeder melde_schaden = eine echte Twilio-WhatsApp = Kosten-/Spam-Vektor.
//
// Zwei IP-unabhaengige Backstops (der Per-IP-Limit bleibt als grober Sekundaerfilter):
//   1. Globaler Circuit-Breaker — Gesamt-Write-Ops/Stunde (env MCP_WRITE_CAP_PER_HOUR).
//      In-Process-Rolling-Counter, exakt wie der bestehende Per-IP-Limit; setzt dieselbe
//      PM2-Single-Process-Annahme voraus (bei Cluster braeuchte es einen geteilten Store —
//      dann greift aber der bestehende Per-IP-Limit ebenso wenig; kein NEUER Fallstrick).
//   2. Per-Telefon-Velocity — max N echte Meldungen/Nummer/24 h (env MCP_WRITE_CAP_PER_PHONE_24H),
//      ueber die 10-Min-Retry-Dedup hinaus. Stoppt WhatsApp-Bombing derselben Opfer-Nummer.
//      DB-basiert (robuster als in-process; ueberlebt Restart/Prozesse).

const HOUR_MS = 60 * 60_000

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}

/** Gesamt-Cap aller Write-Ops pro Stunde (melde_schaden + rueckruf zusammen). Env-tunbar. */
const globalCap = () => envInt('MCP_WRITE_CAP_PER_HOUR', 120)
/** Max. echte Meldungen derselben Telefonnummer in 24 h. Env-tunbar. */
const phoneCap = () => envInt('MCP_WRITE_CAP_PER_PHONE_24H', 3)

// Rolling-Window der akzeptierten Write-Zeitpunkte (In-Process, wie ipHits in den Routen).
const writeHits: number[] = []
let lastTrippedLogTs = 0

function prune(now: number): void {
  while (writeHits.length > 0 && now - writeHits[0] >= HOUR_MS) writeHits.shift()
}

/**
 * Globaler Circuit-Breaker. true = stuendliches Gesamt-Cap erreicht -> Request ablehnen (429).
 * Prueft NUR (zaehlt nicht) — recordGlobalWrite() zaehlt erst NACH bestandenem Gate, damit
 * abgelehnte Requests das Cap nicht selbst weiter aufblaehen. Loggt beim Ausloesen max. 1x/h.
 */
export function globalWriteCapExceeded(): boolean {
  const now = Date.now()
  prune(now)
  const exceeded = writeHits.length >= globalCap()
  if (exceeded && now - lastTrippedLogTs > HOUR_MS) {
    lastTrippedLogTs = now
    // Loggt in die PM2-/Sentry-Log-Pipeline; ein Monitor/Alert kann auf diese Zeile triggern.
    console.error(
      `[mcp-abuse-guard] GLOBAL WRITE CIRCUIT-BREAKER TRIPPED — ${writeHits.length} writes in the last hour (cap ${globalCap()}). Public write-API (melde_schaden/rueckruf) is throttling. Possible spam/abuse or a traffic spike.`,
    )
  }
  return exceeded
}

/** Zaehlt einen akzeptierten Write. Erst NACH globalWriteCapExceeded()===false + Phone-Gate aufrufen. */
export function recordGlobalWrite(): void {
  writeHits.push(Date.now())
}

/**
 * Per-Telefon-Velocity ueber die 10-Min-Retry-Dedup hinaus. true = die Nummer hat das 24h-Cap
 * erreicht (WhatsApp-Bombing-Schutz). Best-effort: bei DB-Fehler false (lieber durchlassen als
 * den Funnel hart brechen — der globale Circuit-Breaker faengt Massen-Missbrauch trotzdem).
 */
export async function phoneWriteCapExceeded(telefon: string): Promise<boolean> {
  const count = await countRecentMcpLeadsByPhone(telefon, 24)
  return count >= phoneCap()
}

/**
 * Per-Telefon-Velocity fuer den oeffentlichen NFC-Gegner-Flow. Dasselbe Limit wie die
 * MCP-Variante, aber gegen die Spalten, die dieser Flow tatsaechlich schreibt.
 * Ohne Nummer: false — es gibt nichts zu limitieren; der Flow faellt stattdessen in den
 * Dispatch-Task-Pfad (keine SMS, kein Auto-Send).
 */
export async function gegnerPhoneWriteCapExceeded(telefon: string): Promise<boolean> {
  const tel = telefon.trim()
  if (!tel) return false
  return (await countRecentGegnerLeadsByPhone(tel, 24)) >= phoneCap()
}
