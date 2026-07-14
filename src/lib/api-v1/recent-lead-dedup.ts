import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Idempotenz / Retry-Dedup fuer die public Write-API (POST /api/v1/melde-schaden +
// /api/v1/rueckruf). LLM-Clients (ChatGPT / Claude / GPT-Action) wiederholen Tool-Calls
// bei Timeouts/Reconnects — ohne Dedup entstuende pro Retry ein ZWEITER Lead + ein
// zweiter Dispatch-Task (Rueckruf) bzw. ein zweiter FlowLink-WhatsApp (melde-schaden),
// die die Dispatch-Queue zumuellen.
//
// Strategie: Natural-Key (telefon + source_channel='mcp') in einem kurzen Zeitfenster.
// KEIN Client-Idempotency-Key — LLMs tragen ueber Retries hinweg keinen stabilen Key
// mit; die Telefonnummer dagegen ist ueber den Retry hinweg byte-identisch (identische
// Tool-Args). Trifft ein frischer MCP-Lead -> der Caller verwendet ihn wieder und returnt
// frueh, statt neu anzulegen.
//
// Bewusster Trade-off: zwei ECHTE getrennte Anfragen derselben Nummer < WINDOW gelten als
// Retry (werden zusammengefasst). Das ist selten + Dispatch-seitig auffangbar; der haeufige
// Fall (LLM-Retry) erzeugt sonst Doppel-Leads. Race-Note: rein sequentielle Retries (Lead
// aus Versuch 1 ist committed, bevor Versuch 2 startet) sind abgedeckt — exakt gleichzeitige
// Doppel-Requests faengt das App-Level-Dedup nicht (braeuchte einen DB-Unique-Index), fuer
// den LLM-Retry-Threat aber irrelevant.

const DEDUP_WINDOW_MS = 10 * 60_000 // 10 Minuten

/**
 * Sucht einen frischen, ueber die MCP-Write-API (source_channel='mcp') angelegten Lead mit
 * derselben Telefonnummer innerhalb des Dedup-Fensters (Retry-Erkennung). Best-effort: bei
 * DB-Fehler `null` — lieber neu anlegen als den Funnel hart fehlschlagen lassen.
 */
export async function findRecentMcpLead(telefon: string): Promise<{ leadId: string } | null> {
  const tel = telefon.trim()
  if (!tel) return null
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .select('id')
    .eq('telefon', tel)
    .eq('source_channel', 'mcp')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[api-v1/dedup] findRecentMcpLead fehlgeschlagen:', error.message)
    return null
  }
  return data ? { leadId: data.id as string } : null
}

/**
 * Zaehlt die ueber die MCP-Write-API (source_channel='mcp') angelegten Leads derselben
 * Telefonnummer innerhalb der letzten `hours` Stunden. Grundlage der Per-Telefon-Velocity-
 * Bremse (write-abuse-guard.phoneWriteCapExceeded) — begrenzt WhatsApp-Bombing derselben
 * Opfer-Nummer ueber die 10-Min-Retry-Dedup hinaus. COUNT-only (head:true, kein Row-Transfer).
 * Best-effort: bei DB-Fehler 0 (lieber durchlassen als den Funnel hart brechen — der globale
 * Circuit-Breaker faengt Massen-Missbrauch trotzdem).
 */
export async function countRecentMcpLeadsByPhone(telefon: string, hours: number): Promise<number> {
  const tel = telefon.trim()
  if (!tel) return 0
  const sinceIso = new Date(Date.now() - hours * 60 * 60_000).toISOString()
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('telefon', tel)
    .eq('source_channel', 'mcp')
    .gt('created_at', sinceIso)
  if (error) {
    console.error('[api-v1/dedup] countRecentMcpLeadsByPhone fehlgeschlagen:', error.message)
    return 0
  }
  return count ?? 0
}

/**
 * Wie countRecentMcpLeadsByPhone, aber fuer den oeffentlichen Gegner-Flow der NFC-
 * Schadenkarte (/schaden/[token]). Der schreibt source_channel='schaden-karte' und legt
 * die Nummer in leads.gegner_telefon ab (leads.telefon bleibt NULL) — die MCP-Variante
 * filtert auf telefon + 'mcp' und greift hier deshalb NIE. Ohne diesen Cap waere der
 * SMS-Versand (Slice 2c) ein Bombing-Vektor auf beliebige fremde Nummern.
 * Best-effort: bei DB-Fehler 0 (der globale Circuit-Breaker faengt Massen-Missbrauch).
 */
/**
 * Retry-/Doppel-Submit-Dedup fuer den oeffentlichen NFC-Gegner-Flow. Findet einen frischen
 * Lead (source_channel='schaden-karte') mit DERSELBEN Nummer AM SELBEN Fahrzeug innerhalb des
 * Fensters. Ohne diesen Guard erzeugt ein Reload+Resubmit (der Submit-Button ist nur gegen
 * Doppelklick, nicht gegen Reload geschuetzt) einen ZWEITEN Claim -> eine ZWEITE Unfallmeldung
 * an denselben Versicherer fuer denselben Unfall (nicht zurueckholbar). Der Cap allein liesse
 * bis zu 3 zu. Gibt die schon konvertierte claim_id mit zurueck (falls vorhanden), damit der
 * Caller den bestehenden Vorgang wiederverwenden kann.
 * Best-effort: bei DB-Fehler null -> lieber neu anlegen als den Flow brechen.
 */
export async function findRecentGegnerLead(
  vehicleId: string,
  gegnerTelefon: string,
): Promise<{ leadId: string; claimId: string | null } | null> {
  const tel = gegnerTelefon.trim()
  if (!vehicleId || !tel) return null
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .select('id, konvertiert_zu_claim_id')
    .eq('vehicle_id', vehicleId)
    .eq('gegner_telefon', tel)
    .eq('source_channel', 'schaden-karte')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[api-v1/dedup] findRecentGegnerLead fehlgeschlagen:', error.message)
    return null
  }
  return data ? { leadId: data.id as string, claimId: (data.konvertiert_zu_claim_id as string | null) ?? null } : null
}

export async function countRecentGegnerLeadsByPhone(telefon: string, hours: number): Promise<number> {
  const tel = telefon.trim()
  if (!tel) return 0
  const sinceIso = new Date(Date.now() - hours * 60 * 60_000).toISOString()
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('gegner_telefon', tel)
    .eq('source_channel', 'schaden-karte')
    .gt('created_at', sinceIso)
  if (error) {
    console.error('[api-v1/dedup] countRecentGegnerLeadsByPhone fehlgeschlagen:', error.message)
    return 0
  }
  return count ?? 0
}
