// Konto-Anlage flottenmanager (Business-Partner-Flotte). Muster: anlegePartnerKern.
// Auth-User (Random-PW + force_password_change) -> profiles(rolle='flottenmanager') ->
// firmen_flotten_konten-Link -> Rollback-Cascade bei Fehler. KEIN 'use server'.
import { createAdminClient } from '@/lib/supabase/admin'
import { enablePhoneLogin } from '@/lib/auth/phone-login'
import { insertFlottenmanagerKonto } from '@/lib/flotte/konto-firma'
import type { Database } from '@/lib/supabase/database.types'

type AdminClient = ReturnType<typeof createAdminClient>

function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length]
  return password + 'A1!'
}

export type FlottenmanagerAnlageInput = {
  firmaId: string
  email: string // normalisiert (trim + lowercase)
  telefon: string | null
  vorname: string
  aktiviertVon: string | null
}

export type FlottenmanagerAnlageResult =
  | { ok: true; userId: string; password: string }
  | { ok: false; error: string }

export async function anlegeFlottenmanagerKern(
  admin: AdminClient,
  input: FlottenmanagerAnlageInput,
): Promise<FlottenmanagerAnlageResult> {
  const password = generatePassword()

  // 1) Auth-User
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) {
    return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }
  }
  const userId = authUser.user.id

  // 2) Profile — 2FA explizit AUS (analog anlegePartnerKern: sonst /login/2fa statt Onboarding)
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    email: input.email,
    rolle: 'flottenmanager' as unknown as Database['public']['Enums']['user_role'], // DB-live (Mig 20260711130948), Types-Lag Regel 2
    vorname: input.vorname,
    telefon: input.telefon,
    force_password_change: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  // 3) firmen_flotten_konten-Link. Rollback-Cascade bei Fehler.
  const kon = await insertFlottenmanagerKonto(admin, {
    firmaId: input.firmaId,
    userId,
    aktiviertVon: input.aktiviertVon,
  })
  if (kon.error) {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: kon.error }
  }

  // Telefon-Login aktivieren — best-effort, kollisionssicher (analog anlegePartnerKern)
  await enablePhoneLogin(admin, userId, input.telefon)

  return { ok: true, userId, password }
}
