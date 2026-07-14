// src/lib/vertrieb/get-vertrieb-kontakte.ts
// Liest v_vertrieb_kontakt + leitet die Stufe ab. Die View ist service_role-only
// (revoke anon/authenticated) -> der Caller MUSS den Admin-Client NACH einem Staff-
// Role-Guard injizieren (P1-Wiring; adminClient ohne Guard = IDOR). Reines Read+Derive,
// Ergebnis-Objekt statt throw. Vorbild: src/lib/ops/get-claim-workitems.ts.
// Phase C: Firmen-Flotten werden zusaetzlich aus firmen_flotten_konten + firmen geladen
// (nicht in v_vertrieb_kontakt enthalten — eigener B2B-Silo).
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveVertriebState } from './derive-vertrieb-state'
import type { VertriebKontakt, VertriebKontaktRow } from './vertrieb-kontakt.types'

async function loadFirmenFlotteRows(supabase: SupabaseClient): Promise<VertriebKontaktRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyClient = supabase as any
  const { data: konten } = await anyClient
    .from('firmen_flotten_konten')
    .select('firma_id, status, created_at')
    .order('created_at', { ascending: false })
  if (!Array.isArray(konten) || konten.length === 0) return []

  // Dedupliziere nach firma_id (eine Firma kann mehrere Konten haben, wir wollen
  // pro Firma EINE Roster-Zeile, id = firma.id gemaess Task-Spec).
  const seenFirmaIds = new Set<string>()
  const firmaIds: string[] = []
  for (const k of konten as Array<{ firma_id: string; status: string | null; created_at: string | null }>) {
    if (!seenFirmaIds.has(k.firma_id)) {
      seenFirmaIds.add(k.firma_id)
      firmaIds.push(k.firma_id)
    }
  }

  const { data: firmen } = await anyClient
    .from('firmen')
    .select('id, name, email, telefon, adresse_plz, adresse_ort, notiz, created_at')
    .in('id', firmaIds)
  if (!Array.isArray(firmen)) return []

  // Baue eine Map firma_id -> erster konto-Status + created_at
  const kontoByFirma = new Map<string, { status: string | null; created_at: string | null }>()
  for (const k of konten as Array<{ firma_id: string; status: string | null; created_at: string | null }>) {
    if (!kontoByFirma.has(k.firma_id)) {
      kontoByFirma.set(k.firma_id, { status: k.status, created_at: k.created_at })
    }
  }

  return (
    firmen as Array<{
      id: string
      name: string | null
      email: string | null
      telefon: string | null
      adresse_plz: string | null
      adresse_ort: string | null
      notiz: string | null
      created_at: string | null
    }>
  ).map((f) => {
    const konto = kontoByFirma.get(f.id)
    return {
      id: f.id,
      kind: 'firmen-flotte',
      name: f.name,
      email: f.email,
      telefon: f.telefon,
      plz: f.adresse_plz,
      ort: f.adresse_ort,
      lat: null,
      lng: null,
      owner_id: null,
      quelle: null,
      erstellt_am: konto?.created_at ?? f.created_at,
      roh_status: konto?.status ?? null,
      roh_ist_aktiv: null,
      roh_gesperrt: null,
      roh_verifiziert: null,
      roh_portal_zugang: null,
      roh_onboarding_offen: konto?.status === 'pending' ? true : null,
      roh_warteliste: null,
      notizen: f.notiz,
      rolle: 'firmen-flotte',
    } satisfies VertriebKontaktRow
  })
}

export async function getVertriebKontakte(
  supabase: SupabaseClient,
): Promise<{ ok: true; data: VertriebKontakt[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('v_vertrieb_kontakt')
    .select('*')
    .order('erstellt_am', { ascending: false, nullsFirst: false })
  if (error) return { ok: false, error: (error as { message: string }).message }
  const rows = (data as VertriebKontaktRow[]) ?? []

  const flotteRows = await loadFirmenFlotteRows(supabase)

  const alle = [...rows, ...flotteRows]
  return { ok: true, data: alle.map(deriveVertriebState) }
}
