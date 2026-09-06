'use server'

// SP-C1 — Kunde-Portal Werkstatt-Finder-Actions. Der Kunde eines Reparatur-Claims
// OHNE hinterlegte Werkstatt laedt die naechsten Partner-Werkstaetten und waehlt eine.
// Ownership via Kunde-RLS (createClient): liest der Kunde den Claim, gehoert er ihm.
// Der Finder/Assign laeuft ueber den Admin-Client (vermittlung-server) — Authz liegt
// hier VOR dem Aufruf. Spiegelt das Muster aus reparatur-termin-actions.ts.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { Qualifiziert } from '@/lib/werkstatt/bedarf/qualifiziere'

/** Ownership-Check via Kunde-RLS + "noch keine Werkstatt". */
async function assertOwnerOhneWerkstatt(
  claimId: string,
): Promise<
  | { ok: true; userId: string; center: { lat: number; lng: number } | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: claim } = await supabase
    .from('claims')
    .select(
      'id, reparatur_werkstatt_id, schadenort_lat, schadenort_lng, schadenort_adresse, schadenort_plz, schadenort_ort',
    )
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Vorgang nicht gefunden.' }
  const c = claim as {
    reparatur_werkstatt_id: string | null
    schadenort_lat: number | null
    schadenort_lng: number | null
    schadenort_adresse: string | null
    schadenort_plz: string | null
    schadenort_ort: string | null
  }
  if (c.reparatur_werkstatt_id) {
    return { ok: false, error: 'Es ist bereits eine Werkstatt hinterlegt.' }
  }
  // Karten-Center (SP-C2) aus dem Schadenort — Kunde liest es via Owner-RLS.
  if (c.schadenort_lat != null && c.schadenort_lng != null) {
    return {
      ok: true,
      userId: user.id,
      center: { lat: Number(c.schadenort_lat), lng: Number(c.schadenort_lng) },
    }
  }

  // Mobil-/Frontend-Audit 31.08. (prod): **73 von 81 Claims** hatten kein
  // `schadenort_lat`. Ohne Origin liefert `findWerkstaetten` seinen dokumentierten
  // Fallback — „ohne Distanz nach NAME sortiert". Die Liste war damit alphabetisch,
  // obwohl die UI „Partner-Werkstatt in deiner Nähe" verspricht, und die
  // Distanz-Zeile fiel still weg (`distanzLabel` gibt bei Infinity null zurück).
  //
  // Deshalb hier einmalig nachgeholt und PERSISTIERT (Aaron-Entscheidung 31.08.):
  // ein Geocoding-Aufruf pro Claim, nicht pro Seitenaufruf. Ohne das Schreiben
  // würde jeder Aufruf des Finders erneut kosten — Kostenkontext:
  // memory/INCIDENT-google-places-2798-euro-an-einem-tag.
  const ortsteile = [c.schadenort_adresse, c.schadenort_plz, c.schadenort_ort].filter(Boolean)
  if (ortsteile.length === 0) return { ok: true, userId: user.id, center: null }

  const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
  const geo = await geocodeAdresse(ortsteile.join(', '))
  // Kein Treffer / kein Token / API-Fehler: `geocodeAdresse` liefert null und wir
  // bleiben beim bisherigen Verhalten (Fallback-Sortierung), statt zu scheitern.
  if (!geo) return { ok: true, userId: user.id, center: null }

  // Schreiben über den Service-Client: der Kunde hat kein UPDATE-Recht auf `claims`.
  // Fehler wird geprüft (claims ist eine kritische Tabelle, silent-write-Gate) —
  // aber er darf den Finder nicht blockieren: der Center steht ja bereits fest,
  // beim nächsten Aufruf wird eben erneut geocodet.
  const { error: geoWriteErr } = await createServiceClient()
    .from('claims')
    .update({ schadenort_lat: geo.lat, schadenort_lng: geo.lng })
    .eq('id', claimId)
  if (geoWriteErr) {
    console.error('[werkstatt-finder] Geo-Persistierung fehlgeschlagen:', geoWriteErr.message)
  }

  return { ok: true, userId: user.id, center: { lat: geo.lat, lng: geo.lng } }
}

/** Die naechsten aktiven Partner-Werkstaetten zum Schadenort des Claims (bedarf-qualifiziert). */
export async function ladeWerkstaettenFuerClaim(
  claimId: string,
): Promise<
  | {
      ok: true
      werkstaetten: Qualifiziert<WerkstattFinderRow>[]
      keineSpezialisierte: boolean
      center: { lat: number; lng: number } | null
    }
  | { ok: false; error: string }
> {
  if (!claimId) return { ok: false, error: 'Claim-ID fehlt.' }
  const owner = await assertOwnerOhneWerkstatt(claimId)
  if (!owner.ok) return { ok: false, error: owner.error }
  const { findQualifizierteReparaturWerkstaetten } = await import('@/lib/werkstatt/vermittlung-server')
  const { resolveNetzwerkOwnerProfilId } = await import('@/lib/netzwerk/resolve-netzwerk-owner')
  // P2-T6 (Netzwerk): Owner-Knoten des Claims (per-Claim > Kunden-Default > null) fuer die
  // relationale "Ihr Netzwerk"-Partition — Freund-Werkstaetten des Owners floaten nach oben.
  // Service-Client: netzwerk_owner-Spalten sind nicht kunden-RLS-lesbar. null = No-op.
  const ownerProfilId = await resolveNetzwerkOwnerProfilId(createServiceClient(), { claimId })
  // nurEchte: der Kunde darf keine Test-/internen Werkstaetten sehen (SSoT interne-identitaet).
  const { werkstaetten, keineSpezialisierte } = await findQualifizierteReparaturWerkstaetten({
    target: 'claim',
    id: claimId,
    nurEchte: true,
    ownerProfilId,
  })
  return { ok: true, werkstaetten, keineSpezialisierte, center: owner.center }
}

/** Kunde waehlt eine Werkstatt fuer seinen Reparatur-Claim (quelle='kunde'). */
export async function waehleWerkstattPortal(
  claimId: string,
  werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId || !werkstattId) return { ok: false, error: 'Claim und Werkstatt sind erforderlich.' }
  const owner = await assertOwnerOhneWerkstatt(claimId)
  if (!owner.ok) return { ok: false, error: owner.error }

  // Anti-IDOR: nur eine aktive Partner-Werkstatt darf zugewiesen werden. Der Kunde kann
  // werkstaetten nicht per RLS lesen -> Service-Client fuer die reine Statuspruefung.
  const svc = createServiceClient()
  const { data: w } = await svc
    .from('werkstaetten')
    .select('id, status')
    .eq('id', werkstattId)
    .maybeSingle()
  if (!w || (w as { status: string | null }).status !== 'aktiv') {
    return { ok: false, error: 'Diese Werkstatt ist nicht verfügbar.' }
  }

  // P4 T9 (Netzwerk): ist der Claim SV-netzwerk-gebunden (netzwerk_owner_id zeigt auf ein
  // Sachverstaendigen-Profil — SV-Vermittlungs-Flow), traegt die Zuweisung quelle='gutachter'
  // (Attribution: der SV hat die Reparatur in sein Netzwerk gesteuert, der Kunde waehlt nur
  // self-served aus). Sonst unveraendert 'kunde'. Non-fatal: Aufloesungs-Fehler -> 'kunde'.
  let quelle: 'kunde' | 'gutachter' = 'kunde'
  try {
    const svcQ = createServiceClient()
    const { resolveNetzwerkOwnerProfilId } = await import('@/lib/netzwerk/resolve-netzwerk-owner')
    const ownerProfilId = await resolveNetzwerkOwnerProfilId(svcQ, { claimId })
    if (ownerProfilId) {
      const { data: svRow } = await svcQ
        .from('sachverstaendige')
        .select('id')
        .eq('profile_id', ownerProfilId)
        .maybeSingle()
      if (svRow) quelle = 'gutachter'
    }
  } catch (err) {
    console.warn('[waehleWerkstattPortal] quelle-Aufloesung non-fatal (fallback kunde):', err)
  }

  const { assignReparaturWerkstatt } = await import('@/lib/werkstatt/vermittlung-server')
  const res = await assignReparaturWerkstatt({
    target: 'claim',
    id: claimId,
    werkstattId,
    quelle,
    actorUserId: owner.userId,
  })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
