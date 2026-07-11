// Role-aware firma-Resolver fuer die geteilte Fleet-View. kunde -> personen.firma_id
// (getKundeFirma, Bestand); flottenmanager -> firmen_flotten_konten.firma_id.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKundeFirma, type KundeFirma } from '@/lib/kunde/firma-flotte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** firma des eingeloggten flottenmanagers (via firmen_flotten_konten). db = Admin/Service-Role. */
export async function getFlottenmanagerFirma(db: AnyDb, userId: string): Promise<KundeFirma | null> {
  const { data: konto } = await db
    .from('firmen_flotten_konten')
    .select('firma_id')
    .eq('user_id', userId)
    .eq('status', 'aktiv')
    .maybeSingle()
  const firmaId = (konto?.firma_id as string | null) ?? null
  if (!firmaId) return null
  const { data: f } = await db
    .from('firmen')
    .select('id, name, rechtsform, ust_id, adresse_strasse, adresse_plz, adresse_ort')
    .eq('id', firmaId)
    .maybeSingle()
  if (!f) return null
  return {
    id: f.id as string,
    name: (f.name as string | null) ?? '',
    rechtsform: (f.rechtsform as string | null) ?? null,
    ustId: (f.ust_id as string | null) ?? null,
    strasse: (f.adresse_strasse as string | null) ?? null,
    plz: (f.adresse_plz as string | null) ?? null,
    ort: (f.adresse_ort as string | null) ?? null,
  }
}

/** Dispatch nach Rolle: kunde -> personen.firma_id; flottenmanager -> firmen_flotten_konten. */
export async function resolveKontoFirma(db: AnyDb, userId: string, rolle: string): Promise<KundeFirma | null> {
  if (rolle === 'flottenmanager') return getFlottenmanagerFirma(db, userId)
  return getKundeFirma(db, userId)
}

/** flottenmanager-Konto anlegen (Link user<->firma). db = Admin/Service-Role (AnyDb: firmen_flotten_konten noch nicht in database.types, Regel-2-Lag). */
export async function insertFlottenmanagerKonto(
  db: AnyDb,
  params: { firmaId: string; userId: string; aktiviertVon: string | null },
): Promise<{ error: string | null }> {
  const { error } = await db.from('firmen_flotten_konten').insert({
    firma_id: params.firmaId,
    user_id: params.userId,
    status: 'aktiv',
    aktiviert_von: params.aktiviertVon,
  })
  return { error: error ? error.message : null }
}
