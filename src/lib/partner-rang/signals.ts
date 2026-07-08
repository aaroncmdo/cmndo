// src/lib/partner-rang/signals.ts
import type { PartnerSignals } from './types'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type Kandidat = { id: string; signals: PartnerSignals }

const JAHR_MS = 365.25 * 24 * 60 * 60 * 1000
function jahreSeit(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / JAHR_MS)
}

export function zaehleZertifikate(row: {
  bvsk_mitgliedsnummer?: string | null; dat_nummer?: string | null
  ihk_zertifikat_nummer?: string | null; oebuv_bestellungsnummer?: string | null
}): number {
  return [row.bvsk_mitgliedsnummer, row.dat_nummer, row.ihk_zertifikat_nummer, row.oebuv_bestellungsnummer]
    .filter((x) => typeof x === 'string' && x.trim().length > 0).length
}

/** Alle echten (nicht-Test/geloescht) SVs mit aggregierten Signalen. */
export async function ladeSvKandidaten(supabase: Sb): Promise<Kandidat[]> {
  const { data: svs, error } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, verifiziert, partner_seit, ablehnungen_30_tage, oeffentlich_bestellt, bvsk_mitgliedsnummer, dat_nummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer')
    .eq('ist_testaccount', false)
    .is('geloescht_am', null)
    .is('gesperrt_seit', null)
  if (error || !svs || svs.length === 0) return []

  const ids: string[] = svs.map((s: { id: string }) => s.id)
  const profileIds: string[] = svs.map((s: { profile_id: string | null }) => s.profile_id).filter(Boolean)

  // Termine (Volumen + No-Show) je assignee_id.
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('assignee_id, status, sv_no_show_am')
    .eq('assignee_typ', 'sachverstaendiger')
    .in('assignee_id', ids)
  // Ratings je profile_id.
  const { data: ratings } = await supabase
    .from('google_bewertungen_cache')
    .select('profile_id, durchschnitt, anzahl_bewertungen')
    .in('profile_id', profileIds)
  // Offene Reklamationen (bearbeitet_am IS NULL) je sv_id.
  const { data: rekl } = await supabase
    .from('reklamationen')
    .select('sv_id, bearbeitet_am')
    .in('sv_id', ids)
    .is('bearbeitet_am', null)

  const volumen = new Map<string, number>()
  const noShow = new Map<string, number>()
  const terminGesamt = new Map<string, number>()
  for (const t of (termine ?? []) as { assignee_id: string; status: string | null; sv_no_show_am: string | null }[]) {
    terminGesamt.set(t.assignee_id, (terminGesamt.get(t.assignee_id) ?? 0) + 1)
    if (t.status === 'abgeschlossen') volumen.set(t.assignee_id, (volumen.get(t.assignee_id) ?? 0) + 1)
    if (t.sv_no_show_am) noShow.set(t.assignee_id, (noShow.get(t.assignee_id) ?? 0) + 1)
  }
  const ratingByProfile = new Map<string, { d: number | null; n: number }>()
  for (const r of (ratings ?? []) as { profile_id: string; durchschnitt: number | null; anzahl_bewertungen: number | null }[]) {
    ratingByProfile.set(r.profile_id, { d: r.durchschnitt, n: r.anzahl_bewertungen ?? 0 })
  }
  const offeneRekl = new Map<string, number>()
  for (const r of (rekl ?? []) as { sv_id: string }[]) {
    offeneRekl.set(r.sv_id, (offeneRekl.get(r.sv_id) ?? 0) + 1)
  }

  return svs.map((sv: {
    id: string; profile_id: string | null; verifiziert: boolean | null; partner_seit: string | null
    ablehnungen_30_tage: number | null; oeffentlich_bestellt: boolean | null
    bvsk_mitgliedsnummer: string | null; dat_nummer: string | null
    ihk_zertifikat_nummer: string | null; oebuv_bestellungsnummer: string | null
  }): Kandidat => {
    const gesamt = terminGesamt.get(sv.id) ?? 0
    const rating = sv.profile_id ? ratingByProfile.get(sv.profile_id) : undefined
    const signals: PartnerSignals = {
      typ: 'sachverstaendiger',
      volumen: volumen.get(sv.id) ?? 0,
      oeffentlichBestellt: sv.oeffentlich_bestellt === true,
      zertifikate: zaehleZertifikate(sv),
      partnerSeitJahre: jahreSeit(sv.partner_seit),
      ratingDurchschnitt: rating?.d ?? null,
      ratingAnzahl: rating?.n ?? 0,
      aktiv: sv.verifiziert === true,
      offeneReklamationen: offeneRekl.get(sv.id) ?? 0,
      noShowQuote: gesamt > 0 ? (noShow.get(sv.id) ?? 0) / gesamt : 0,
      ablehnungen30d: sv.ablehnungen_30_tage ?? 0,
    }
    return { id: sv.id, signals }
  })
}

/** Makler: volumen-gefuehrt (duenne Qualitaetsdaten). */
export async function ladeMaklerKandidaten(supabase: Sb): Promise<Kandidat[]> {
  const { data: makler, error } = await supabase
    .from('makler')
    .select('id, status, aktiviert_am, gesperrt_am')
    .is('gesperrt_am', null)
  if (error || !makler || makler.length === 0) return []
  const ids: string[] = makler.map((m: { id: string }) => m.id)
  // Provisions-Ledger-Unifikation (Phase 3): partner_provisionen (typ-gefiltert) statt makler_provisionen.
  const { data: prov } = await supabase
    .from('partner_provisionen')
    .select('partner_id, status')
    .eq('partner_typ', 'makler')
    .in('partner_id', ids)
  const volumen = new Map<string, number>()
  for (const p of (prov ?? []) as { partner_id: string; status: string | null }[]) {
    if (p.status === 'freigegeben' || p.status === 'ausgezahlt') {
      volumen.set(p.partner_id, (volumen.get(p.partner_id) ?? 0) + 1)
    }
  }
  return makler.map((m: { id: string; status: string | null; aktiviert_am: string | null }): Kandidat => ({
    id: m.id,
    signals: {
      typ: 'makler',
      volumen: volumen.get(m.id) ?? 0,
      oeffentlichBestellt: false, zertifikate: 0, partnerSeitJahre: jahreSeit(m.aktiviert_am),
      ratingDurchschnitt: null, ratingAnzahl: 0,
      aktiv: m.status === 'aktiv',
      offeneReklamationen: 0, noShowQuote: 0, ablehnungen30d: 0,
    },
  }))
}
