// Admin-Comped-Toggle (Netzwerkpartner): pure Entscheidungslogik.
//
// Zentrale Invariante: Stripe-gefuehrte Status (aktiv/ueberfaellig) werden vom
// Admin NIE angefasst — deren Lebenszyklus gehoert dem Stripe-Webhook
// (applyNetzwerkAboEvent) + Dunning-Cron. 'comped' ist der einzige
// admin-gefuehrte Status (P1.6 "Bestand comped" / Deal-Hebel).
//
// Multi-Row-tolerant: sv_netzwerk_abonnements hat KEIN Unique auf sv_id (nur
// PK auf id); die Entitlement-Leser (istAktivesAbo/ladeZahlendeSvSet) werten
// ohnehin alle Rows aus. Setzen = neue comped-Row (Historie bleibt),
// Entziehen = bestehende comped-Rows -> inaktiv.
//
// gueltig_bis ist fuer die Entscheidung bewusst irrelevant: auch ein
// abgelaufenes 'aktiv' bleibt Stripe-gefuehrt (Webhook raeumt auf, nicht wir).

export type AboRowMin = { id: string; status: string }
export type CompedZiel = 'setzen' | 'entziehen'

export type CompedEntscheidung =
  | { ok: true; aktion: 'insert_comped' }
  | { ok: true; aktion: 'set_inaktiv'; rowIds: string[] }
  | { ok: true; aktion: 'noop'; grund: string }
  | { ok: false; error: string }

const STRIPE_GEFUEHRT = new Set(['aktiv', 'ueberfaellig'])

export function entscheideCompedToggle(rows: AboRowMin[], ziel: CompedZiel): CompedEntscheidung {
  const compedRows = rows.filter((r) => r.status === 'comped')
  const hatStripeAbo = rows.some((r) => STRIPE_GEFUEHRT.has(r.status))

  if (ziel === 'setzen') {
    if (compedRows.length > 0) return { ok: true, aktion: 'noop', grund: 'bereits comped' }
    if (hatStripeAbo) {
      return {
        ok: false,
        error: 'Zahlendes Stripe-Abo vorhanden (aktiv/ueberfaellig) — comped wuerde kollidieren. Falls gewollt: Abo zuerst in Stripe kuendigen.',
      }
    }
    return { ok: true, aktion: 'insert_comped' }
  }

  if (compedRows.length > 0) {
    return { ok: true, aktion: 'set_inaktiv', rowIds: compedRows.map((r) => r.id) }
  }
  if (hatStripeAbo) {
    return {
      ok: false,
      error: 'Kein comped-Abo — das laufende Abo ist Stripe-gefuehrt und kann nur in Stripe gekuendigt werden.',
    }
  }
  return { ok: false, error: 'Kein comped-Abo vorhanden — nichts zu entziehen.' }
}
