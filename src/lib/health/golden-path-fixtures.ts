/**
 * Golden-Path E2E-Harness: persistente Test-Fixtures
 *
 * Legt idempotent drei Test-Accounts an:
 *   - golden-path-sv@claimondo.test  (Sachverstaendiger, ist_aktiv=false — aus Dispatch raus)
 *   - golden-path-kb@claimondo.test  (Kundenbetreuer)
 *   - golden-path-kunde@claimondo.test (Kunde)
 *
 * Rueckgabe: { svId, svUserId, kbUserId, kundeUserId }
 *   - svId:       sachverstaendige.id (UUID)
 *   - svUserId:   auth-user-id / profiles.id des Test-SV
 *   - kbUserId:   auth-user-id / profiles.id des Test-KB
 *   - kundeUserId: auth-user-id / profiles.id des Test-Kunden
 *
 * Idempotent: mehrfache Aufrufe erzeugen keine Duplikate.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const SV_EMAIL = 'golden-path-sv@claimondo.test'
const KB_EMAIL = 'golden-path-kb@claimondo.test'
const KUNDE_EMAIL = 'golden-path-kunde@claimondo.test'
const TEST_PASSWORD = 'GoldenPath2026!'

export interface GoldenPathFixtures {
  /** sachverstaendige.id */
  svId: string
  /** auth-user-id / profiles.id des Test-SV */
  svUserId: string
  /** auth-user-id / profiles.id des Test-KB */
  kbUserId: string
  /** auth-user-id / profiles.id des Test-Kunden */
  kundeUserId: string
}

/**
 * Holt die bestehende user-id fuer eine Email aus der profiles-Tabelle.
 * Gibt null zurueck wenn kein Eintrag existiert.
 */
async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  return data?.id ?? null
}

/**
 * Idempotente Auth-User-Erzeugung.
 * Wenn die Email bereits existiert, wird die bestehende user-id zurueckgegeben.
 */
async function ensureAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  vorname: string,
  nachname: string,
): Promise<string> {
  // Erst in profiles nachschauen (schnell)
  const existing = await findUserIdByEmail(admin, email)
  if (existing) return existing

  // Neu anlegen
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { vorname, nachname },
  })

  if (error) {
    // Fallback: Email existiert bereits in Auth, aber noch kein profiles-Eintrag
    if (error.message.toLowerCase().includes('already') || error.status === 422) {
      // listUsers + filter als letzter Ausweg
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const found = list?.users?.find((u) => u.email === email)
      if (found) return found.id
    }
    throw new Error(`Auth-User anlegen fehlgeschlagen fuer ${email}: ${error.message}`)
  }

  return data.user.id
}

/**
 * Idempotentes profiles-Upsert.
 */
async function ensureProfile(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  email: string,
  vorname: string,
  nachname: string,
  rolle: string,
): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .upsert(
      {
        id,
        email,
        vorname,
        nachname,
        rolle,
        twofa_aktiviert: false,
        twofa_email_aktiviert: false,
        auth_provider: 'email',
        force_password_change: false,
      },
      { onConflict: 'id' },
    )
  if (error) throw new Error(`profiles.upsert fehlgeschlagen fuer ${email}: ${error.message}`)
}

/**
 * Idempotente sachverstaendige-Erzeugung (select-or-create via profile_id).
 * Gibt die sachverstaendige.id zurueck.
 */
async function ensureSachverstaendiger(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<string> {
  // Existiert bereits?
  const { data: existing } = await admin
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (existing) return existing.id

  // Neu anlegen mit ist_aktiv: false (aus Dispatch raus)
  const { data, error } = await admin
    .from('sachverstaendige')
    .insert({
      profile_id: profileId,
      ist_aktiv: false,
      ist_testaccount: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`sachverstaendige.insert fehlgeschlagen: ${error.message}`)
  return data.id
}

/**
 * Legt idempotent alle drei Test-Fixtures an und gibt ihre IDs zurueck.
 * Beim zweiten Aufruf entstehen keine Duplikate.
 */
export async function ensureGoldenPathFixtures(): Promise<GoldenPathFixtures> {
  const admin = createAdminClient()

  // --- Test-Sachverstaendiger ---
  const svUserId = await ensureAuthUser(admin, SV_EMAIL, 'GoldenPath', 'SV')
  await ensureProfile(admin, svUserId, SV_EMAIL, 'GoldenPath', 'SV', 'sachverstaendiger')
  const svId = await ensureSachverstaendiger(admin, svUserId)

  // --- Test-Kundenbetreuer ---
  const kbUserId = await ensureAuthUser(admin, KB_EMAIL, 'GoldenPath', 'KB')
  await ensureProfile(admin, kbUserId, KB_EMAIL, 'GoldenPath', 'KB', 'kundenbetreuer')

  // --- Test-Kunde ---
  const kundeUserId = await ensureAuthUser(admin, KUNDE_EMAIL, 'GoldenPath', 'Kunde')
  await ensureProfile(admin, kundeUserId, KUNDE_EMAIL, 'GoldenPath', 'Kunde', 'kunde')

  return { svId, svUserId, kbUserId, kundeUserId }
}
