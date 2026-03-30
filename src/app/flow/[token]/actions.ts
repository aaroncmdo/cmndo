'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function notifyNeuerFall(fallId: string) {
  const supabase = await createClient()

  const { data: fall } = await supabase
    .from('faelle')
    .select('fall_nummer, schadens_ursache')
    .eq('id', fallId)
    .single()

  if (!fall) return

  const fallNr = fall.fall_nummer ?? fallId.slice(0, 8)
  const schadensart = fall.schadens_ursache ?? 'Unbekannt'

  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('rolle', 'admin')

  for (const admin of admins ?? []) {
    if (admin.email) {
      await emailNeuerFall(admin.email, fallNr, schadensart).catch(() => {})
    }
  }
}

/**
 * Creates a Supabase Auth user for the customer after flow completion.
 * Sets kunde_id on the case and creates default pflichtdokumente.
 * Returns the generated password so the flow can display it.
 */
export async function createKundeAccount(
  fallId: string,
  email: string,
  vorname: string,
  nachname: string,
  telefon: string | null
): Promise<{ password: string }> {
  const admin = createAdminClient()

  // Generate a random password
  const password = generatePassword()

  // Create auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { vorname, nachname },
  })

  if (authError) {
    // If user already exists, that's ok - just get the existing user
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      const { data: existingUsers } = await admin.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email === email)
      if (existing) {
        // Update password for the existing user so the flow can show it
        await admin.auth.admin.updateUserById(existing.id, { password })

        // Ensure profile exists with rolle=kunde
        await admin.from('profiles').upsert({
          id: existing.id,
          rolle: 'kunde',
          vorname,
          nachname,
          email,
          telefon: telefon || null,
          force_password_change: true,
          auth_provider: 'email',
        }, { onConflict: 'id' })

        // Set kunde_id on the case
        await admin.from('faelle').update({ kunde_id: existing.id }).eq('id', fallId)

        // Create default pflichtdokumente
        await createDefaultPflichtdokumente(admin, fallId)

        return { password }
      }
    }
    throw new Error(`Konto konnte nicht erstellt werden: ${authError.message}`)
  }

  const userId = authUser.user.id

  // Create profile
  await admin.from('profiles').upsert({
    id: userId,
    rolle: 'kunde',
    vorname,
    nachname,
    email,
    telefon: telefon || null,
    force_password_change: true,
    auth_provider: 'email',
  }, { onConflict: 'id' })

  // Set kunde_id on the case
  await admin.from('faelle').update({ kunde_id: userId }).eq('id', fallId)

  // Create default pflichtdokumente
  await createDefaultPflichtdokumente(admin, fallId)

  return { password }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}

async function createDefaultPflichtdokumente(
  admin: ReturnType<typeof createAdminClient>,
  fallId: string
) {
  const defaults = [
    {
      titel: 'Personalausweis / Reisepass',
      beschreibung: 'Zur Identitaetspruefung benoetigen wir eine Kopie Ihres Ausweises.',
      pflicht: true,
    },
    {
      titel: 'Mietvertrag / Eigentumsnachweis',
      beschreibung: 'Nachweis ueber Ihr Miet- oder Eigentumsverhaeltnis der betroffenen Immobilie.',
      pflicht: true,
    },
    {
      titel: 'Versicherungspolice',
      beschreibung: 'Ihre aktuelle Versicherungspolice zum betroffenen Objekt.',
      pflicht: true,
    },
    {
      titel: 'Schadenmeldung an Versicherung',
      beschreibung: 'Falls Sie den Schaden bereits bei Ihrer Versicherung gemeldet haben, laden Sie die Bestaetigung hoch.',
      pflicht: false,
    },
    {
      titel: 'Kostenvoranschlaege / Rechnungen',
      beschreibung: 'Falls bereits Kostenvoranschlaege oder Rechnungen fuer die Reparatur vorliegen.',
      pflicht: false,
    },
  ]

  // Check if pflichtdokumente already exist for this fall
  const { data: existing } = await admin
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .limit(1)

  if (existing && existing.length > 0) return

  await admin.from('pflichtdokumente').insert(
    defaults.map(d => ({
      fall_id: fallId,
      titel: d.titel,
      beschreibung: d.beschreibung,
      pflicht: d.pflicht,
      status: 'ausstehend',
    }))
  )
}
