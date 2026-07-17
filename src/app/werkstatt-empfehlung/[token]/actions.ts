'use server'

// Kunde-Magic-Link: der SV hat 1-3 Werkstaetten empfohlen; der Kunde waehlt hier
// selbst (kein Login). Service-role-only Zugriff auf die Empfehlungs-Tabellen —
// die Authz ist der unguessbare Token. Die Wahl feuert die BESTEHENDE
// assignReparaturWerkstatt-Kette (quelle='gutachter').

import { createAdminClient } from '@/lib/supabase/admin'
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-server'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { revalidatePath } from 'next/cache'

export type EmpfehlungWerkstatt = WerkstattFinderRow & { gruende: MatchGrund[] }

export type EmpfehlungView = {
  status: string
  werkstaetten: EmpfehlungWerkstatt[]
  gewaehlteWerkstattId: string | null
  gutachter: { name: string; firma: string | null; ratingDurchschnitt: number | null; ratingAnzahl: number | null }
  gutachten: { reparaturkostenBrutto: number | null }
}

// ⚠ createAdminClient() ist UNGETYPT -> tsc prueft die select-Strings NICHT.
// Spaltennamen sind gegen Bestandscode verifiziert (finder.ts SELECT_COLS,
// gutachter-finder-actions.ts, page.tsx v_gutachten_werte).
const WERKSTATT_COLS =
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert'

export async function getWerkstattEmpfehlungByToken(
  token: string,
): Promise<{ ok: true; data: EmpfehlungView } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: batchRow } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id, claim_id, status, expires_at, gewaehlte_werkstatt_id')
    .eq('token', token)
    .maybeSingle()
  const batch = batchRow as {
    id: string
    claim_id: string
    status: string
    expires_at: string
    gewaehlte_werkstatt_id: string | null
  } | null
  if (!batch) return { ok: false, error: 'Dieser Link ist ungültig.' }
  if (batch.status === 'offen' && new Date(batch.expires_at).getTime() < Date.now())
    return { ok: false, error: 'Dieser Link ist abgelaufen.' }
  if (batch.status === 'zurueckgezogen' || batch.status === 'abgelaufen')
    return { ok: false, error: 'Diese Empfehlung ist nicht mehr aktiv.' }

  const { data: empfRows } = await admin
    .from('werkstatt_empfehlungen')
    .select('werkstatt_id, rang, distanz_km, match_snapshot')
    .eq('batch_id', batch.id)
    .order('rang')
  const empf = (empfRows ?? []) as Array<{
    werkstatt_id: string
    rang: number
    distanz_km: number | null
    match_snapshot: { gruende?: MatchGrund[] } | null
  }>
  const ids = empf.map((e) => e.werkstatt_id)

  const { data: wRows } = await admin
    .from('werkstaetten')
    .select(WERKSTATT_COLS)
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const wById = new Map(
    ((wRows ?? []) as unknown as Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'> & { verifiziert: boolean | null }>).map(
      (w) => [w.id, w],
    ),
  )

  const werkstaetten: EmpfehlungWerkstatt[] = empf
    .map((e) => {
      const w = wById.get(e.werkstatt_id)
      if (!w) return null
      return {
        ...w,
        verifiziert: w.verifiziert ?? false,
        distanz_km: e.distanz_km ?? Infinity,
        passt: true,
        gruende: e.match_snapshot?.gruende ?? [],
      }
    })
    .filter((x): x is EmpfehlungWerkstatt => x !== null)

  // Gutachter-Profil (claim.sv_id -> sachverstaendige -> profiles + Google-Bewertung).
  let gutachter = { name: 'Ihr Gutachter', firma: null as string | null, ratingDurchschnitt: null as number | null, ratingAnzahl: null as number | null }
  const { data: claim } = await admin.from('claims').select('sv_id').eq('id', batch.claim_id).maybeSingle()
  const svId = (claim as { sv_id: string | null } | null)?.sv_id ?? null
  if (svId) {
    const { data: sv } = await admin.from('sachverstaendige').select('firmenname, profile_id').eq('id', svId).maybeSingle()
    const svRow = sv as { firmenname: string | null; profile_id: string | null } | null
    if (svRow?.profile_id) {
      const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', svRow.profile_id).maybeSingle()
      const pr = p as { vorname: string | null; nachname: string | null } | null
      const { data: g } = await admin
        .from('google_bewertungen_cache')
        .select('durchschnitt, anzahl_bewertungen')
        .eq('profile_id', svRow.profile_id)
        .maybeSingle()
      const gr = g as { durchschnitt: number | null; anzahl_bewertungen: number | null } | null
      gutachter = {
        name: [pr?.vorname, pr?.nachname].filter(Boolean).join(' ') || 'Ihr Gutachter',
        firma: svRow.firmenname,
        ratingDurchschnitt: gr?.durchschnitt != null ? Number(gr.durchschnitt) : null,
        ratingAnzahl: gr?.anzahl_bewertungen ?? null,
      }
    }
  }

  // Gutachten-Kurzfassung (kuratiert — KEIN sv_honorar).
  const { data: gw } = await admin
    .from('v_gutachten_werte')
    .select('reparaturkosten_brutto')
    .eq('claim_id', batch.claim_id)
    .maybeSingle()
  const gwR = gw as { reparaturkosten_brutto: number | null } | null

  return {
    ok: true,
    data: {
      status: batch.status,
      werkstaetten,
      gewaehlteWerkstattId: batch.gewaehlte_werkstatt_id,
      gutachter,
      gutachten: { reparaturkostenBrutto: gwR?.reparaturkosten_brutto != null ? Number(gwR.reparaturkosten_brutto) : null },
    },
  }
}

export async function waehleWerkstattAusEmpfehlung(
  token: string,
  werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  const { data: batchRow } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id, claim_id, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  const batch = batchRow as { id: string; claim_id: string; status: string; expires_at: string } | null
  if (!batch) return { ok: false, error: 'Ungültiger Link.' }
  if (batch.status === 'entschieden') return { ok: true } // idempotent: bereits gewaehlt
  if (batch.status !== 'offen' || new Date(batch.expires_at).getTime() < Date.now())
    return { ok: false, error: 'Diese Empfehlung ist nicht mehr aktiv.' }

  const { data: cand } = await admin
    .from('werkstatt_empfehlungen')
    .select('id')
    .eq('batch_id', batch.id)
    .eq('werkstatt_id', werkstattId)
    .maybeSingle()
  if (!cand) return { ok: false, error: 'Diese Werkstatt gehört nicht zur Empfehlung.' }

  // Batch schliessen (guard status='offen' -> verhindert Doppel-Assign bei Reload).
  const { error: uErr, count } = await admin
    .from('werkstatt_empfehlung_batches')
    .update(
      { status: 'entschieden', gewaehlte_werkstatt_id: werkstattId, entschieden_am: new Date().toISOString(), updated_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', batch.id)
    .eq('status', 'offen')
    .select('id')
  if (uErr) return { ok: false, error: uErr.message }
  if (!count) return { ok: true } // parallele Wahl hat gewonnen -> idempotent

  // BESTAND: setzt reparatur_werkstatt_*, benachrichtigt Kunde + Werkstatt, Provisions-Trigger.
  const res = await assignReparaturWerkstatt({ target: 'claim', id: batch.claim_id, werkstattId, quelle: 'gutachter', actorUserId: null })
  if (!res.ok) return res

  revalidatePath(`/werkstatt-empfehlung/${token}`)
  return { ok: true }
}
