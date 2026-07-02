'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { revalidatePath } from 'next/cache'

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

export async function createWerkstatt(
  formData: FormData,
): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
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
  }).select('id').single()

  if (wErr || !w) {
    // Rollback: Profile + Auth-User entfernen
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: wErr?.message ?? 'Werkstatt-Anlage fehlgeschlagen' }
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

  revalidatePath('/admin/werkstaetten')
  return { ok: true, email, password }
}
