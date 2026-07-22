'use server'

// Kunde-Magic-Link: der SV hat 1-3 Werkstaetten empfohlen; der Kunde waehlt hier
// selbst (kein Login). Service-role-only Zugriff auf die Empfehlungs-Tabellen —
// die Authz ist der unguessbare Token. Die Wahl feuert die BESTEHENDE
// assignReparaturWerkstatt-Kette (quelle='gutachter').

import { createAdminClient } from '@/lib/supabase/admin'
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-server'
import { findWerkstattVorschlaegeFuer } from '@/lib/werkstatt/matching/lade-vorschlaege'
import type { VermittlungQuelle } from '@/lib/werkstatt/vermittlung-core'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { revalidatePath } from 'next/cache'

export type EmpfehlungWerkstatt = WerkstattFinderRow & {
  gruende: MatchGrund[]
  google_rating?: number | null
  google_review_count?: number | null
}

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
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert,google_rating,google_review_count'

// „Weitere Werkstaetten in der Naehe" (Plan T5, war P-later): der Kunde darf ueber die
// 1-3 Empfehlungen des Gutachters hinausschauen, wenn keine davon passt.
//
// ⚠ ANBIETEN und VALIDIEREN muessen DECKUNGSGLEICH sein (siehe lade-vorschlaege.ts):
// gleiche Engine, gleiches nurEchte, gleiches Limit — sonst wird eine Werkstatt, die wir
// dem Kunden angeboten haben, beim Auswaehlen abgelehnt. Genau deshalb geht BEIDES durch
// diesen einen Helper; die Konstante wird bewusst NICHT exportiert ('use server'-File:
// Werte-Exporte landen im Client-Bundle als undefined).
const WEITERE_LIMIT = 12

async function ladeWeitereKandidaten(claimId: string) {
  return findWerkstattVorschlaegeFuer({ target: 'claim', id: claimId, nurEchte: true }, WEITERE_LIMIT)
}

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
    ((wRows ?? []) as unknown as Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'> & { verifiziert: boolean | null; google_rating?: number | null; google_review_count?: number | null }>).map(
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

/**
 * Zusaetzliche Partner-Werkstaetten in der Naehe, OHNE die bereits empfohlenen.
 * Wird erst auf Klick geladen — der Default bleibt die kuratierte 1-3-Auswahl des
 * Gutachters; das hier ist die Ausweichoption, wenn keine davon passt.
 */
export async function ladeWeitereWerkstaetten(
  token: string,
): Promise<{ ok: true; data: EmpfehlungWerkstatt[] } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: batchRow } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id, claim_id, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  const batch = batchRow as { id: string; claim_id: string; status: string; expires_at: string } | null
  if (!batch) return { ok: false, error: 'Dieser Link ist ungültig.' }
  if (batch.status !== 'offen' || new Date(batch.expires_at).getTime() < Date.now())
    return { ok: false, error: 'Diese Empfehlung ist nicht mehr aktiv.' }

  // Bereits empfohlene ausblenden — die stehen schon oben in der Liste.
  const { data: empfRows } = await admin
    .from('werkstatt_empfehlungen')
    .select('werkstatt_id')
    .eq('batch_id', batch.id)
  const schonEmpfohlen = new Set(
    ((empfRows ?? []) as Array<{ werkstatt_id: string }>).map((e) => e.werkstatt_id),
  )

  const kandidaten = await ladeWeitereKandidaten(batch.claim_id)
  return { ok: true, data: kandidaten.filter((k) => !schonEmpfohlen.has(k.id)) }
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
  // Der Kunde darf auch eine NICHT empfohlene Werkstatt aus der Naehe waehlen („weitere
  // anzeigen"). Dann serverseitig gegen DIESELBE Kandidatenliste validieren, die wir ihm
  // angeboten haben (ladeWeitereKandidaten) — der rohen ID vom Client nie vertrauen — und
  // die Quelle ehrlich als 'kunde' fuehren: diese Werkstatt kam nicht aus der Empfehlung
  // des Gutachters, das soll die Zuweisung auch so ausweisen.
  let quelle: VermittlungQuelle = 'gutachter'
  if (!cand) {
    const kandidaten = await ladeWeitereKandidaten(batch.claim_id)
    if (!kandidaten.some((k) => k.id === werkstattId))
      return { ok: false, error: 'Diese Werkstatt steht für diesen Fall nicht zur Auswahl.' }
    quelle = 'kunde'
  }

  // Batch schliessen (guard status='offen' -> verhindert Doppel-Assign bei Reload).
  // Auf die zurueckgegebenen Rows (data) pruefen, NICHT auf count: count kann je nach
  // Content-Range-Header null sein und wuerde dann einen erfolgreichen Update faelschlich
  // als „nichts geaendert" werten -> der Assign wuerde uebersprungen.
  const { error: uErr, data: geschlossen } = await admin
    .from('werkstatt_empfehlung_batches')
    .update({ status: 'entschieden', gewaehlte_werkstatt_id: werkstattId, entschieden_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', batch.id)
    .eq('status', 'offen')
    .select('id')
  if (uErr) return { ok: false, error: uErr.message }
  if (!geschlossen || geschlossen.length === 0) return { ok: true } // schon entschieden / parallele Wahl -> idempotent

  // BESTAND: setzt reparatur_werkstatt_*, benachrichtigt Kunde + Werkstatt, Provisions-Trigger.
  const res = await assignReparaturWerkstatt({ target: 'claim', id: batch.claim_id, werkstattId, quelle, actorUserId: null })
  if (!res.ok) return res

  revalidatePath(`/werkstatt-empfehlung/${token}`)
  return { ok: true }
}
