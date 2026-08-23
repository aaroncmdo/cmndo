// Team-WhatsApp bei neuen Leads — der schmale Bruder von `notifyNewLead`.
//
// Warum ein eigener Helper statt `notifyNewLead`: der schickt zusaetzlich eine
// Email an info@claimondo.de. Das ist fuer die oeffentlichen Formular-Leads
// gewollt, fuer intern angelegte Leads (Dispatch/Admin) aber Laerm. Hier geht
// NUR die WhatsApp an `WA_TEAM_EMPFAENGER` raus.
//
// Hintergrund (Audit 23.08.2026): Von 13 Lead-Erzeugern benachrichtigten nur
// zwei das Team ueberhaupt. Neun waren komplett stumm — weder WhatsApp noch
// In-App. Darunter `embed/werkstatt-finder` und `kunde/schaden-melden`: ein
// Kunde meldete dort einen Schaden, und niemand erfuhr davon. Der Lead lag
// still in der Liste, bis jemand von sich aus nachsah.
//
// Non-critical: wirft NIE. Ein fehlgeschlagener Versand darf die Lead-Anlage
// nicht brechen (AGENTS.md §Server-Actions, Notify-Sub-Ops).

import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export interface TeamLeadNotifyOpts {
  /** Lead-UUID — wird zum Link `/dispatch/leads/<id>`. Fehlt sie, entfaellt der Link. */
  leadId: string | null
  /** Menschenlesbare Quelle, erscheint als erste Zeile. Bsp: "Werkstatt-Finder". */
  quelle: string
  /** "Vorname Nachname" oder was vorhanden ist. */
  name?: string | null
  telefon?: string | null
  email?: string | null
  /** Zusatzzeilen (bereits formatiert, ohne Emoji-Praefix). */
  zusatz?: Array<string | null | undefined>
  /**
   * Ueberschreibt den Default-Link `/dispatch/leads/<leadId>` — als Pfad ab
   * Root (z.B. `/faelle/<id>`). Noetig bei `direct-claim`-Eintrittspunkten,
   * wo sofort ein Claim entsteht und die Fallakte der nuetzlichere Ort ist.
   */
  linkPfad?: string | null
  /**
   * true = intern angelegt (Dispatch/Admin/SV legt selbst an). Erscheint als
   * Marker in der Nachricht, damit man sie von echten Kundenmeldungen
   * unterscheiden kann — wer die internen abschalten will, findet sie darueber.
   */
  intern?: boolean
}

/**
 * Schickt eine kurze Team-WhatsApp ueber einen neuen Lead.
 * Fire-and-forget: Fehler werden geloggt, nie geworfen.
 */
export async function notifyTeamNeuerLead(opts: TeamLeadNotifyOpts): Promise<void> {
  try {
    const kopf = opts.intern ? `🏢 Neuer Lead (intern): ${opts.quelle}` : `🆕 Neuer Lead: ${opts.quelle}`
    const zeilen: Array<string | null | undefined> = [
      kopf,
      '',
      opts.name?.trim() ? `👤 ${opts.name.trim()}` : null,
      opts.telefon?.trim() ? `📞 ${opts.telefon.trim()}` : null,
      opts.email?.trim() ? `✉️ ${opts.email.trim()}` : null,
      ...(opts.zusatz ?? []),
      ...(() => {
        const pfad = opts.linkPfad ?? (opts.leadId ? `/dispatch/leads/${opts.leadId}` : null)
        return pfad ? ['', `${APP_BASE_URL}${pfad}`] : []
      })(),
    ]
    const text = zeilen.filter((z) => z !== null && z !== undefined).join('\n')
    await notifyTeamWhatsApp(text)
  } catch (err) {
    console.error('[notify-team-lead] Team-WA fehlgeschlagen (nicht kritisch):', err)
  }
}
