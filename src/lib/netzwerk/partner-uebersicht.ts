// Reine Ableitung fuer die Admin-Netzwerkpartner-Uebersicht: aus den (0..n) Abo-Rows eines SV
// den repraesentativen Anzeige-Status + das effektive Entitlement (istAktivesAbo, derive-at-read).
// Keine I/O. Der Loader liefert die Rows erstellt_am DESC (juengste zuerst).
import { istAktivesAbo } from './entitlement'

export type AboRow = {
  status: string
  gueltig_bis: string | null
  stripe_subscription_id?: string | null
}

export type NetzwerkPartnerStatus = {
  /** Repraesentativer Abo-Status fuers Badge (aktiv-bevorzugt, comped vor aktiv); 'kein_abo' = 0 Rows. */
  kind: 'comped' | 'aktiv' | 'ueberfaellig' | 'gekuendigt' | 'inaktiv' | 'kein_abo'
  /** Effektiv entitled (istAktivesAbo über irgendeine Row): der SV ist JETZT Netzwerkpartner. */
  istAktiv: boolean
  gueltigBis: string | null
  stripeSubscriptionId: string | null
}

const BEKANNTE_KINDS = new Set(['comped', 'aktiv', 'ueberfaellig', 'gekuendigt', 'inaktiv'])
function normalisiereKind(status: string): NetzwerkPartnerStatus['kind'] {
  return BEKANNTE_KINDS.has(status) ? (status as NetzwerkPartnerStatus['kind']) : 'inaktiv'
}

export function deriveNetzwerkPartnerStatus(rows: AboRow[], now: Date = new Date()): NetzwerkPartnerStatus {
  if (rows.length === 0) {
    return { kind: 'kein_abo', istAktiv: false, gueltigBis: null, stripeSubscriptionId: null }
  }
  const aktive = rows.filter((r) => istAktivesAbo(r, now))
  // Repraesentativ: eine aktive Row (comped vor aktiv = Anzeige-Prioritaet), sonst die juengste (rows[0]).
  const repr = aktive.length > 0 ? (aktive.find((r) => r.status === 'comped') ?? aktive[0]) : rows[0]
  return {
    kind: normalisiereKind(repr.status),
    istAktiv: aktive.length > 0,
    gueltigBis: repr.gueltig_bis ?? null,
    stripeSubscriptionId: repr.stripe_subscription_id ?? null,
  }
}
