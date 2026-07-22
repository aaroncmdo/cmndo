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

/** WhatsApp-Nummer des eingeloggten Flottenmanagers (aktives Konto). db = Admin/Service-Role.
 *  Fuer die FM-WA-Schaden-Benachrichtigung (T2 operativer-schaden-flow) — NULL => keine WA-Notif. */
export async function getFlottenmanagerWhatsapp(db: AnyDb, userId: string): Promise<string | null> {
  const { data } = await db
    .from('firmen_flotten_konten')
    .select('whatsapp_nummer')
    .eq('user_id', userId)
    .eq('status', 'aktiv')
    .maybeSingle()
  return (data?.whatsapp_nummer as string | null) ?? null
}

/** WhatsApp-Nummern ALLER aktiven Flottenmanager einer Firma (T4 operativer-schaden-flow).
 *  Nur nicht-leere Nummern. db = Admin/Service-Role. Fuer die FM-Schaden-Benachrichtigung. */
export async function getFlottenmanagerWhatsappNummern(db: AnyDb, firmaId: string): Promise<string[]> {
  const { data } = await db
    .from('firmen_flotten_konten')
    .select('whatsapp_nummer')
    .eq('firma_id', firmaId)
    .eq('status', 'aktiv')
    .not('whatsapp_nummer', 'is', null)
  return ((data ?? []) as Array<{ whatsapp_nummer: string | null }>)
    .map((r) => r.whatsapp_nummer)
    .filter((n): n is string => Boolean(n && n.trim()))
}

/** Dispatch nach Rolle: kunde -> personen.firma_id; flottenmanager -> firmen_flotten_konten. */
export async function resolveKontoFirma(db: AnyDb, userId: string, rolle: string): Promise<KundeFirma | null> {
  if (rolle === 'flottenmanager') return getFlottenmanagerFirma(db, userId)
  return getKundeFirma(db, userId)
}

/** Konto-Status + firma-Name des flottenmanagers fuers Portal-Layout. db = Admin/Service-Role (AnyDb, Regel-2-Lag). */
export async function getFlottenmanagerKontoWithFirma(
  db: AnyDb, userId: string,
): Promise<{ status: string; firmaName: string } | null> {
  const { data } = await db
    .from('firmen_flotten_konten')
    .select('status, firma:firma_id(name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  const firmaRaw = (data as Record<string, unknown>).firma
  const firma = (Array.isArray(firmaRaw) ? firmaRaw[0] : firmaRaw) as { name: string } | null
  return { status: (data as Record<string, unknown>).status as string, firmaName: firma?.name ?? 'Flotte' }
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
