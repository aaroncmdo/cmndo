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
