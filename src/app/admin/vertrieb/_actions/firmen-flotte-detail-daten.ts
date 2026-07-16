'use server'
// Admin-Firmen-Flotten-Detail-Loader (Task 2).
// Laedt alle Daten einer Firma fuer die Detail-Ansicht: Firma, Konten,
// Fahrzeuge, Schadenkarten, Schaeden. Admin/Dispatch-gegatet, Admin-Client.
// AAR-664: nur die async function exportiert, kein Type-Export aus 'use server'.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKartenFuerFirma } from '@/lib/schadenkarte/schadenkarte'
import type {
  FirmenFlotteDetail,
  FlottenFahrzeug,
  FlottenKontoInfo,
  FlottenKarte,
  FlottenSchaden,
} from '../_lib/firmen-flotte-detail'

export async function getFirmenFlotteDetail(
  firmaId: string,
): Promise<{ ok: true; data: FirmenFlotteDetail } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  // 1) Firma laden
  const { data: firmaRaw, error: firmaErr } = await admin
    .from('firmen')
    .select('id, name, ust_id, rechtsform, adresse_strasse, adresse_plz, adresse_ort, telefon, email, webseite, notiz')
    .eq('id', firmaId)
    .maybeSingle()

  if (firmaErr) return { ok: false, error: firmaErr.message }
  if (!firmaRaw) return { ok: false, error: 'Firma nicht gefunden.' }

  const firma = firmaRaw as {
    id: string
    name: string
    ust_id: string | null
    rechtsform: string | null
    adresse_strasse: string | null
    adresse_plz: string | null
    adresse_ort: string | null
    telefon: string | null
    email: string | null
    webseite: string | null
    notiz: string | null
  }

  // 2) Flotten-Konten + Profile laden
  const { data: kontenRaw, error: kontenErr } = await admin
    .from('firmen_flotten_konten')
    .select('id, user_id, status, aktiviert_am')
    .eq('firma_id', firmaId)
    .order('aktiviert_am', { ascending: false })

  if (kontenErr) return { ok: false, error: kontenErr.message }

  const kontenRows = (kontenRaw ?? []) as Array<{
    id: string
    user_id: string
    status: string
    aktiviert_am: string | null
  }>

  const konten: FlottenKontoInfo[] = []
  for (const k of kontenRows) {
    const { data: profRaw } = await admin
      .from('profiles')
      .select('email, vorname, nachname, telefon')
      .eq('id', k.user_id)
      .maybeSingle()
    const prof = profRaw as {
      email: string | null
      vorname: string | null
      nachname: string | null
      telefon: string | null
    } | null
    konten.push({
      konto_id: k.id,
      user_id: k.user_id,
      status: k.status,
      aktiviert_am: k.aktiviert_am,
      email: prof?.email ?? null,
      vorname: prof?.vorname ?? null,
      nachname: prof?.nachname ?? null,
      telefon: prof?.telefon ?? null,
    })
  }

  // 3) Flotten-Fahrzeuge + Fahrzeugdaten laden
  const { data: fahrzeugeRaw, error: fahrzeugeErr } = await admin
    .from('flotten_fahrzeuge')
    .select('id, vehicle_id, notiz, vehicles(id, kennzeichen_aktuell, hersteller, modell_haupttyp, modell_untertyp, status)')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })

  if (fahrzeugeErr) return { ok: false, error: fahrzeugeErr.message }

  const fahrzeugeRows = (fahrzeugeRaw ?? []) as Array<{
    id: string
    vehicle_id: string
    notiz: string | null
    vehicles: unknown
  }>

  const fahrzeuge: FlottenFahrzeug[] = fahrzeugeRows.map((row) => {
    const veh = (Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles) as {
      id?: string
      kennzeichen_aktuell?: string | null
      hersteller?: string | null
      modell_haupttyp?: string | null
      modell_untertyp?: string | null
      status?: string | null
    } | null

    const modellParts = [veh?.modell_haupttyp ?? null, veh?.modell_untertyp ?? null].filter(
      (p): p is string => Boolean(p),
    )

    return {
      flotten_fahrzeug_id: row.id,
      vehicle_id: row.vehicle_id,
      kennzeichen: veh?.kennzeichen_aktuell ?? null,
      hersteller: veh?.hersteller ?? null,
      modell: modellParts.length > 0 ? modellParts.join(' ') : null,
      status: veh?.status ?? null,
      notiz: row.notiz,
    }
  })

  // Lookup-Map: vehicle_id -> kennzeichen (fuer Karten + Schaeden)
  const kennzeichenByVehicleId: Record<string, string | null> = {}
  for (const f of fahrzeuge) {
    kennzeichenByVehicleId[f.vehicle_id] = f.kennzeichen
  }

  // 4) Schadenkarten ueber den kanonischen getKartenFuerFirma-Service laden
  const kartenRaw = await getKartenFuerFirma(admin, firmaId)

  const karten: FlottenKarte[] = kartenRaw.map((k) => ({
    id: k.id,
    token: k.token,
    status: k.status,
    fahrzeug_id: k.fahrzeugId,
    kennzeichen:
      k.fahrzeugId != null ? (kennzeichenByVehicleId[k.fahrzeugId] ?? null) : null,
  }))

  // 5) Schaeden (claims) fuer alle Fahrzeuge dieser Flotte laden
  const vehicleIds = fahrzeuge.map((f) => f.vehicle_id)

  let schaeden: FlottenSchaden[] = []
  if (vehicleIds.length > 0) {
    const { data: schadenRaw, error: schadenErr } = await admin
      .from('claims')
      // T3-slice-2b: claims.status -> operative_status
      .select('id, claim_nummer, vehicle_id, operative_status, schadentag, schadens_hoehe_netto')
      .in('vehicle_id', vehicleIds)
      .order('schadentag', { ascending: false })

    if (schadenErr) return { ok: false, error: schadenErr.message }

    schaeden = ((schadenRaw ?? []) as Array<{
      id: string
      claim_nummer: string | null
      vehicle_id: string
      operative_status: string | null
      schadentag: string | null
      schadens_hoehe_netto: number | null
    }>).map((row) => ({
      claim_id: row.id,
      claim_nummer: row.claim_nummer,
      vehicle_id: row.vehicle_id,
      kennzeichen: kennzeichenByVehicleId[row.vehicle_id] ?? null,
      status: row.operative_status,
      schadentag: row.schadentag,
      schadens_hoehe_netto: row.schadens_hoehe_netto,
    }))
  }

  return {
    ok: true,
    data: {
      firma: {
        id: firma.id,
        name: firma.name,
        ust_id: firma.ust_id,
        rechtsform: firma.rechtsform,
        adresse_strasse: firma.adresse_strasse,
        adresse_plz: firma.adresse_plz,
        adresse_ort: firma.adresse_ort,
        telefon: firma.telefon,
        email: firma.email,
        webseite: firma.webseite,
        notiz: firma.notiz,
      },
      konten,
      fahrzeuge,
      karten,
      schaeden,
    },
  }
}
