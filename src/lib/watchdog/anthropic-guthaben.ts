/**
 * Prueft, ob die Anthropic-API fuer die Produktiv-App ueberhaupt nutzbar ist.
 *
 * ANLASS: Am 20.08. UND am 23.08.2026 war das Guthaben aufgebraucht — beim zweiten Mal
 * **fuenf Tage lang unbemerkt**. Ausgefallen sind dabei nutzersichtbare Dinge: alle drei
 * Copiloten, die Briefing-Generierung (205 Fehlschlaege), die b2b-Pipeline (176) und die
 * KI-Fallsteuerung (`claim_orchestrator`, `ki_aufsicht`).
 *
 * ⭐ Aufgefallen ist es beide Male nur ZUFAELLIG — einmal ueber einen 500er im Cron-Log,
 * einmal bei einer Waechter-Inventur. Es gab nie eine Meldung, weil niemand danach schaute.
 *
 * ⭐ Der Test ist ein Ein-Token-Call: bei leerem Guthaben antwortet die API mit HTTP 400
 * und es entstehen **gar keine** Kosten; im Normalfall kostet ein Token praktisch nichts.
 * Logs sagen „war mal kaputt" — dieser Call sagt „ist es JETZT".
 */

import 'server-only'

/**
 * Bewusst das kleinste Modell, unabhaengig von `AI_MODELS`: Diese Pruefung fragt nach der
 * ABRECHENBARKEIT der Organisation, nicht nach der Qualitaet einer Antwort. Ein teures
 * Modell wuerde denselben Befund liefern und mehr kosten.
 */
export const PROBE_MODELL = 'claude-haiku-4-5-20251001'

export type GuthabenBefund =
  | { status: 'ok' }
  | { status: 'guthaben_leer'; meldung: string }
  | { status: 'kein_key' }
  | { status: 'anderer_fehler'; http: number; meldung: string }

/** Erkennt die Guthaben-Meldung robust — die API liefert sie als `invalid_request_error`. */
export function istGuthabenFehler(meldung: string): boolean {
  return /credit balance is too low/i.test(meldung)
}

/**
 * Fuehrt den Probe-Call aus. Wirft nie — ein Waechter, der an seiner eigenen Pruefung
 * stirbt, meldet nichts.
 */
export async function pruefeAnthropicGuthaben(
  fetchImpl: typeof fetch = fetch,
): Promise<GuthabenBefund> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { status: 'kein_key' }

  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: PROBE_MODELL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    if (res.ok) return { status: 'ok' }

    const text = await res.text()
    let meldung = text.slice(0, 300)
    try {
      const json = JSON.parse(text) as { error?: { message?: string } }
      if (json.error?.message) meldung = json.error.message
    } catch {
      // Kein JSON — der Rohtext ist dann die beste verfuegbare Auskunft.
    }

    if (istGuthabenFehler(meldung)) return { status: 'guthaben_leer', meldung }
    return { status: 'anderer_fehler', http: res.status, meldung }
  } catch (err) {
    // Netzfehler ist NICHT dasselbe wie „Guthaben leer" — sonst meldet ein DNS-Aussetzer
    // einen Zahlungsvorgang.
    return { status: 'anderer_fehler', http: 0, meldung: err instanceof Error ? err.message : String(err) }
  }
}
