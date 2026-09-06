// Team-WhatsApp fuer autounfall.io-Leads (Aaron 06.09.2026: "bitte auch eine whatsapp
// an nicolas und mich wenn bei autounfall io was reinkommt").
//
// Hebt die Standalone-Entscheidung vom 24.05.2026 ("nur in-app") fuer den Team-Kanal auf.
// Der Kunden-Kanal bleibt unberuehrt — au.io schickt weiterhin nichts an Kunden.
//
// ⚠ WARUM HIER EINE ZWEITE KOPIE STEHT: au.io ist ein eigener Build und kann `src/lib/
// whatsapp/team-notify.ts` nicht importieren. Die Nummern sind damit an zwei Stellen —
// genau das, was die kanonische Datei vermeiden wollte ("eine Stelle zum Pflegen").
// Gegenmittel: `src/lib/whatsapp/__tests__/team-nummern-drift.test.ts` liest BEIDE Dateien
// und schlaegt fehl, sobald sie auseinanderlaufen. Wer hier eine Nummer aendert, muss die
// kanonische mitaendern — der Test sagt es sofort, statt dass es jemand Monate spaeter merkt.
//
// KANONISCHE QUELLE: src/lib/whatsapp/team-notify.ts
const TEAM_NUMMERN = ['+491633628571', '+4917620289514']

// Der Baileys-Dienst laeuft auf DEMSELBEN VPS wie au.io (localhost:3055) — deshalb
// braucht es weder eine interne Route in der Haupt-App noch ein zusaetzliches Secret.
// Nur der Token muss in /etc/autounfall/.env.local stehen; fehlt er, meldet der Versand
// `config_missing` und der Lead bleibt trotzdem erfolgreich (s. u.).
const DEFAULT_BASE = 'http://localhost:3055'

/**
 * Schickt denselben Freitext an alle Team-Nummern.
 *
 * Non-critical, wirft NIE: ein Baileys-Ausfall darf einen eingegangenen Lead nicht
 * kaputtmachen (AGENTS.md §Server-Actions — Notify-Sub-Ops brechen den Vorgang nicht).
 * Jeder Fehlschlag wird geloggt, damit "keine WhatsApp bekommen" nachvollziehbar bleibt
 * statt still zu verschwinden.
 */
export async function notifyTeamWhatsApp(text: string): Promise<void> {
  const base = process.env.BAILEYS_BASE_URL ?? DEFAULT_BASE
  const token = process.env.BAILEYS_AUTH_TOKEN
  if (!token) {
    console.error('[au.io team-notify] BAILEYS_AUTH_TOKEN fehlt — keine WhatsApp verschickt')
    return
  }

  await Promise.all(
    TEAM_NUMMERN.map(async (phone) => {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 10000)
      try {
        const res = await fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Baileys-Token': token },
          body: JSON.stringify({ phone, text }),
          signal: ctrl.signal,
          cache: 'no-store',
        })
        if (!res.ok) {
          console.error(`[au.io team-notify] Baileys ${res.status} fuer ${phone}`)
        }
      } catch (err) {
        console.error(`[au.io team-notify] Send an ${phone} fehlgeschlagen:`, (err as Error).message)
      } finally {
        clearTimeout(timeout)
      }
    }),
  )
}
