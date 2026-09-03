// OpenAI Ads (OAIQ) — Attribution einsammeln.
//
// SERVER-ONLY (nutzt next/headers cookies()).
// Muster: ga4-conversions.ts / getConsentedGaClientId.
//
// PHASE 1 (dieser Stand): nur das Auslesen des `oppref`. Der Versand der
// Conversions ueber die Conversions API (`sendOaiqEvent`) folgt in Phase 2 —
// die Trennung ist Absicht: Was beim Anzeigenklick nicht eingesammelt wird, ist
// unwiederbringlich weg, waehrend Events bis zu 7 Tage rueckwirkend akzeptiert
// werden. Einsammeln hat deshalb Vorrang.

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { CONSENT_COOKIE_NAME, parseConsent } from './consent'

/**
 * Name des First-Party-Cookies, in das das OAIQ-SDK den `oppref`-Wert aus der
 * Landing-URL schreibt.
 *
 * ⚠ Aus der OpenAI-Doku uebernommen, an einer LIVE-Installation noch nicht
 * verifiziert — dafuer braucht es einen echten Anzeigenklick. Erster
 * Verifikationsschritt nach dem Livegang: DevTools → Application → Cookies auf
 * claimondo.de. Weicht der Name ab, ist das hier die einzige Stelle zum Aendern.
 * Bis dahin gilt: ein fehlendes Cookie sieht identisch aus wie "kein
 * Anzeigenklick" — beides liefert null.
 */
const OPPREF_COOKIE = '__oppref'

/**
 * `oppref` aus dem Pixel-Cookie des aktuellen Requests — aber NUR bei
 * MARKETING-Consent (Kategorie `ads`), nicht bei blossem Statistik-Consent.
 * Analog zu getConsentedGaClientId(), das dasselbe mit `_ga` und `statistics` tut.
 *
 * Nur im Request-Kontext nutzbar (Server-Action / Route Handler).
 *
 * Liefert null bei: kein Anzeigenklick, kein Marketing-Consent, kein
 * Request-Kontext. Alle drei sind normale Zustaende, kein Fehler — der
 * Aufrufer speichert dann schlicht nichts.
 */
export async function getConsentedOppref(): Promise<string | null> {
  try {
    const store = await cookies()
    const consent = parseConsent(store.get(CONSENT_COOKIE_NAME)?.value)
    if (!consent.marketing) return null
    return store.get(OPPREF_COOKIE)?.value ?? null
  } catch {
    // Kein Request-Kontext (z.B. Cron/Hintergrund) → keine Attribution.
    return null
  }
}

/**
 * `oppref` an einem frisch entstandenen Lead festhalten. EIN Aufruf je
 * Lead-Pfad, direkt nachdem die Lead-ID feststeht.
 *
 * Warum ein Helper statt sechs Copy-Paste-Bloecke: `lead_created` entsteht an
 * SECHS Stellen im Marketing-Build, vier davon ueber `anfragen` +
 * `convert_anfrage_zu_lead` (die RPC ist fest verdrahtet und reicht keine
 * beliebigen Felder durch — es braucht dort ohnehin einen Nachtrag-Update).
 * Sechsmal dieselben acht Zeilen waeren sechs Stellen, an denen der naechste
 * Umbau eine vergessen kann.
 *
 * ⚠ NICHT fire-and-forget, und der Fehler wird geprueft: `leads` steht auf der
 * Liste kritischer Tabellen (AGENTS.md §Stille-Write-Gate, Baseline 0). Der
 * naheliegende Vorlage-Write fuer `ga_client_id` in
 * create-lead-from-mini-wizard.ts:101 ist genau so einer OHNE Pruefung —
 * bewusst nicht kopiert. Ein stillschweigend fehlgeschlagenes oppref-Update
 * kostet die Attribution des gesamten Pfades, ohne dass irgendwo etwas rot wird.
 *
 * Wirft nie: die Lead-Anlage ist zu diesem Zeitpunkt bereits erfolgreich und
 * darf an einem Attributions-Detail nicht scheitern.
 */
export async function persistiereOppref(leadId: string): Promise<void> {
  const oppref = await getConsentedOppref()
  // Kein Anzeigenklick oder kein Marketing-Consent → nichts zu speichern.
  // Das ist der Normalfall bei organischem Verkehr, kein Fehler.
  if (!oppref) return

  try {
    const { error } = await createServiceClient()
      .from('leads')
      .update({ oppref })
      .eq('id', leadId)
    if (error) {
      console.error('[oaiq] oppref nicht gespeichert — Attribution verloren:', leadId, error.message)
    }
  } catch (err) {
    console.error('[oaiq] oppref-Update:', leadId, (err as Error).message)
  }
}
