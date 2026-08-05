'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { setzeStandardStaffel } from '@/lib/partner/standard-staffel'
import { FAHRZEUG_GRUPPEN_VALUES } from '@/lib/werkstatt/fahrzeug-gruppen'
import { revalidatePath } from 'next/cache'
import { logPartnerEvent } from '@/lib/partner/log-partner-event'

// Reuse the same generatePassword helper as in src/app/admin/team/actions.ts.
// Mirrors the alphanum-only set (no 0/O/1/l/I), crypto-random.
function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }
  // Ensure at least one digit + suffix A1! for complexity requirements
  return password + 'A1!'
}

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

// Internal vocab — NOT exported (Client-Bundle macht undefined daraus, AAR-664)
const FAEHIGKEITEN_VALUES = ['karosserie', 'lackierung', 'mechanik', 'glas', 'smart_repair'] as const

export async function setWerkstattFaehigkeiten(
  werkstattId: string,
  faehigkeiten: string[],
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Fähigkeiten setzen.' }
  const clean = faehigkeiten.filter((f) => (FAEHIGKEITEN_VALUES as readonly string[]).includes(f))
  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ faehigkeiten: clean }).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

// Task #5: Werkstatt-MARKEN pflegen (Array-Spalte werkstaetten.marken) — die STÄRKSTE Ranking-Achse
// (markengebunden schlägt frei). Marken sind freier Text (kein CHECK); die Engine matcht
// case-insensitiv. Normalisiert: trim, non-empty, dedupe. Vorher gab es KEINE UI dafür.
export async function setWerkstattMarken(
  werkstattId: string,
  marken: string[],
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Marken setzen.' }
  const clean = Array.from(new Set(marken.map((m) => m.trim()).filter((m) => m.length > 0)))
  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ marken: clean }).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

// D2 (Aaron 27.07., Spec 2026-07-27-werkstatt-finder-followups): ist_freie_werkstatt pflegbar —
// "Nimmt alle Marken an (markenoffen)". Der Override bildet auch "Vertragswerkstatt, nimmt
// trotzdem alle" ab; reine Spezialisten schalten ihn aus.
export async function setWerkstattMarkenoffen(
  werkstattId: string,
  markenoffen: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen das Marken-Profil ändern.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('werkstaetten')
    .update({ ist_freie_werkstatt: markenoffen })
    .eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

// Task #5: FAHRZEUG-GRUPPEN pflegen (Array-Spalte werkstaetten.fahrzeug_gruppen) — Ranking-Achse.
// Fixe Werte-Liste (FAHRZEUG_GRUPPEN_VALUES); Unbekanntes wird gefiltert.
export async function setWerkstattFahrzeugGruppen(
  werkstattId: string,
  gruppen: string[],
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Fahrzeug-Gruppen setzen.' }
  const clean = gruppen.filter((g) => (FAHRZEUG_GRUPPEN_VALUES as readonly string[]).includes(g))
  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ fahrzeug_gruppen: clean }).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

export async function createWerkstatt(
  formData: FormData,
): Promise<{ ok: true; email: string; password: string; werkstattId: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Werkstätten anlegen.' }

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const adresse_strasse = String(formData.get('adresse_strasse') ?? '').trim()
  const adresse_plz = String(formData.get('adresse_plz') ?? '').trim()
  const adresse_ort = String(formData.get('adresse_ort') ?? '').trim()
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw !== null && latRaw !== '' ? Number(latRaw) : null
  const lng = lngRaw !== null && lngRaw !== '' ? Number(lngRaw) : null
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const ansprechpartner_name = String(formData.get('ansprechpartner_name') ?? '').trim() || null
  const provision = Number(formData.get('provision_betrag_netto') ?? 150) || 150
  const faehigkeiten = formData.getAll('faehigkeiten').map(String).filter((f) => (FAEHIGKEITEN_VALUES as readonly string[]).includes(f))

  if (!name || !email || lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Name, E-Mail und Standort sind Pflicht.' }
  }

  const admin = createAdminClient()
  const password = generatePassword()

  // 1) Auth-User anlegen (rolle='werkstatt')
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) {
    return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }
  }
  const userId = authUser.user.id

  // 2) Profile anlegen (rolle='werkstatt')
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    email,
    rolle: 'werkstatt',
    vorname: name,
    force_password_change: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profErr) {
    // Rollback: Auth-User entfernen
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  // 3) werkstaetten-Row anlegen
  const normalized_name = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const { data: w, error: wErr } = await admin.from('werkstaetten').insert({
    name,
    normalized_name,
    adresse_strasse,
    adresse_plz,
    adresse_ort,
    telefon,
    ansprechpartner_name,
    email,
    lat,
    lng,
    user_id: userId,
    provision_betrag_netto: provision,
    provision_aktiv: true,
    status: 'aktiv',
    aktiviert_am: new Date().toISOString(),
    aktiviert_von: adminUser.id,
    // Anlage fragt keine Marken ab -> markenoffen. Explizit true statt DB-Default null,
    // damit der Datenbestand die bewerteMarke-Ableitung (keine Marken = 'frei') abbildet.
    ist_freie_werkstatt: true,
    ...(faehigkeiten.length > 0 ? { faehigkeiten } : {}),
  }).select('id').single()

  if (wErr || !w) {
    // Rollback: Profile + Auth-User entfernen
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: wErr?.message ?? 'Werkstatt-Anlage fehlgeschlagen' }
  }

  // 3b) Onboarding-Drip enrollen (non-critical) — direkt nach dem status='aktiv'-Insert oben.
  //     Idempotent (DB-UNIQUE werkstatt_id); ein Fehler hier darf die Anlage nicht brechen.
  try {
    const { enrolleWerkstatt } = await import('@/lib/werkstatt-onboarding/enroll')
    await enrolleWerkstatt(admin, w.id as string)
  } catch (e) {
    console.error('[enroll] werkstatt-onboarding', e)
  }

  // 4) Isochrone defensiv berechnen — werkstaetten.isochrone (jsonb, GeoJSON Polygon).
  //    Column heißt 'isochrone' (NICHT 'isochrone_polygon' wie bei sachverstaendige).
  //    Fehler sind non-fatal: die Werkstatt ist bereits angelegt.
  try {
    const points = await calculateIsochrone(lat, lng, 30)
    if (points.length >= 3) {
      const ring = points.map((p) => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      await admin
        .from('werkstaetten')
        .update({ isochrone: { type: 'Polygon', coordinates: [ring] } })
        .eq('id', w.id)
    }
  } catch (err) {
    console.error('[werkstatt] Isochrone fehlgeschlagen (non-fatal):', err)
  }

  // 5) Standard-Staffelung (Default-Bonus-Stufen) — best-effort, non-fatal (jede Werkstatt-Anlage).
  await setzeStandardStaffel(admin, 'werkstatt', w.id as string)

  revalidatePath('/admin/werkstaetten')
  return { ok: true, email, password, werkstattId: w.id }
}

export async function setWerkstattVerifiziert(
  werkstattId: string,
  verifiziert: boolean,
  notiz?: string,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Werkstätten verifizieren.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('werkstaetten')
    .update({
      verifiziert,
      verifiziert_am: verifiziert ? new Date().toISOString() : null,
      verifiziert_von: verifiziert ? adminUser.id : null,
      verifizierung_notiz: notiz ?? null,
    } as Record<string, unknown>)
    .eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  if (verifiziert) {
    await logPartnerEvent({ partnerTyp: 'werkstatt', partnerId: werkstattId, typ: 'verifiziert', text: `Werkstatt verifiziert${notiz ? `: ${notiz}` : ''}` })
  }
  return { ok: true }
}

export async function sendWerkstattLoginMail(
  werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Login-Mails senden.' }

  const admin = createAdminClient()
  const { data: w, error: wErr } = await admin
    .from('werkstaetten')
    .select('id, name, email, user_id')
    .eq('id', werkstattId)
    .maybeSingle()
  if (wErr || !w) return { ok: false, error: wErr?.message ?? 'Werkstatt nicht gefunden.' }
  if (!w.email) return { ok: false, error: 'Werkstatt hat keine E-Mail-Adresse.' }
  if (!w.user_id) return { ok: false, error: 'Werkstatt hat keinen Login-Account.' }

  // Reiner Magic-Link-Weg: sendWillkommenWerkstatt erzeugt einen frischen Recovery-Link
  // ("Passwort setzen & einloggen"). Kein Einmalpasswort-Reset mehr (der Link setzt das
  // Passwort; das im Anlage-Dialog angezeigte Fallback-Passwort bleibt fuer die manuelle
  // Weitergabe unberuehrt).
  try {
    const { sendWillkommenWerkstatt } = await import('@/lib/email/google/flows')
    await sendWillkommenWerkstatt({
      to: w.email,
      werkstattName: w.name ?? 'Ihre Werkstatt',
    })
  } catch (err) {
    console.error('[sendWerkstattLoginMail] Versand fehlgeschlagen:', err)
    const msg = err instanceof Error ? err.message : 'E-Mail-Versand fehlgeschlagen'
    return { ok: false, error: msg }
  }

  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
