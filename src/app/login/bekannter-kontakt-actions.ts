'use server'

// Login ohne Link (Soll-Blatt memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto, Weg 2).
//
// Beide Actions antworten IMMER { ok: true } — bekannt, unbekannt, gedrosselt, Fehler:
// nach aussen ununterscheidbar (Enumeration-Schutz, Muster requestPasswordReset).
// Fail-closed: jeder Fehler auf dem Weg legt KEIN Konto an und schickt NICHTS.
//
// Stufe 2 (20.09.2026, Migration 20260920155109): profiles.email ist nullable — ein Konto
// entsteht auch fuer Leads OHNE E-Mail (createUser({ phone, phone_confirm })). Der Besitz von
// Vorgaengen laeuft dann ueber lib/kunde/besitz.ts (E-Mail ODER Telefon, NULL nie gleich NULL).
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/format/telefon'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'
import { buildWelcomeConfirmLink } from '@/lib/auth/welcome-link'
import { sendLoginLink } from '@/lib/email/google/flows'

const MAX_LOGIN_MAILS_PRO_STUNDE = 3

type Neutral = { ok: true }
const NEUTRAL: Neutral = { ok: true }

// listUsers ist die einzige Admin-API, die nach Telefon suchen kann (auth.users.phone).
// Seitenweise (1000/Seite), damit die Pruefung auch jenseits von 1000 Konten nicht still blind wird.
const LIST_USERS_SEITE = 1000
async function kontoVorhanden(
  admin: ReturnType<typeof createAdminClient>,
  pruefe: (u: { phone?: string | null; email?: string | null }) => boolean,
): Promise<boolean | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_SEITE })
    if (error) {
      console.error('[login-kontakt] listUsers:', error.message)
      return null
    }
    const users = data?.users ?? []
    if (users.some(pruefe)) return true
    if (users.length < LIST_USERS_SEITE) return false
  }
  return false
}

export async function bereiteTelefonLoginVor(telefonRaw: string): Promise<Neutral> {
  try {
    const phone = toE164(telefonRaw)
    if (!phone) return NEUTRAL
    const admin = createAdminClient()

    const vorgaenge = await findeVorgaengeZuKontakt(admin, { telefon: phone })
    if (vorgaenge.leadIds.length === 0 && vorgaenge.claimIds.length === 0) return NEUTRAL

    // auth.users.phone ist E.164 ohne '+'.
    const ohnePlus = phone.replace(/^\+/, '')
    const vorhanden = await kontoVorhanden(admin, (u) => (u.phone ?? '').replace(/^\+/, '') === ohnePlus)
    if (vorhanden !== false) return NEUTRAL // true = Konto da, null = Fehler (fail-closed)

    // Stufe 2: Konto auch ohne Lead-E-Mail — Supabase erlaubt reine Telefon-Konten,
    // profiles.email ist seit 20260920155109 nullable.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      ...(vorgaenge.leadEmail ? { email: vorgaenge.leadEmail, email_confirm: true } : {}),
    })
    if (createErr || !created?.user) {
      // users_phone_key / "already registered": die Nummer haengt schon an einem Konto (z. B. Admin-
      // Override enablePhoneLogin) — dann geht der OTP an dieses Konto, nichts anzulegen.
      const kollision = /already registered|phone_exists|users_phone_key/i.test(createErr?.message ?? '')
      if (kollision) console.warn('[login-kontakt] Nummer gehoert schon einem Konto — OTP geht dorthin')
      else console.error('[login-kontakt] createUser fehlgeschlagen:', createErr?.message)
      return NEUTRAL
    }

    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: created.user.id,
        rolle: 'kunde',
        email: vorgaenge.leadEmail ?? null,
        telefon: phone,
        vorname: vorgaenge.leadVorname,
        auth_provider: 'phone',
        force_password_change: false,
      },
      { onConflict: 'id' },
    )
    if (profErr) console.error('[login-kontakt] profiles.upsert fehlgeschlagen:', profErr.message)
    return NEUTRAL
  } catch (err) {
    console.error('[login-kontakt] bereiteTelefonLoginVor:', err)
    return NEUTRAL
  }
}

export async function sendeAnmeldeLinkPerEmail(emailRaw: string): Promise<Neutral> {
  try {
    const email = (emailRaw ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) return NEUTRAL
    const admin = createAdminClient()

    // ANTI-BOMBING wie requestPasswordReset: max. N Mails/h je Empfaenger.
    // FAIL-OPEN hier bewusst NICHT: ein DB-Hiccup im Check zaehlt als 0 (count null).
    const seit = new Date(Date.now() - 60 * 60_000).toISOString()
    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('template', 'login_link')
      .eq('empfaenger', email)
      .gte('created_at', seit)
    if ((count ?? 0) >= MAX_LOGIN_MAILS_PRO_STUNDE) return NEUTRAL

    const vorgaenge = await findeVorgaengeZuKontakt(admin, { email })
    if (vorgaenge.leadIds.length === 0 && vorgaenge.claimIds.length === 0) return NEUTRAL

    const vorhanden = await kontoVorhanden(admin, (u) => (u.email ?? '').toLowerCase() === email)
    if (vorhanden === null) return NEUTRAL

    if (!vorhanden) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
      if (createErr || !created?.user) {
        console.error('[login-kontakt] createUser (email) fehlgeschlagen:', createErr?.message)
        return NEUTRAL
      }
      const { error: profErr } = await admin.from('profiles').upsert(
        { id: created.user.id, rolle: 'kunde', email, vorname: vorgaenge.leadVorname, auth_provider: 'email', force_password_change: false },
        { onConflict: 'id' },
      )
      if (profErr) {
        console.error('[login-kontakt] profiles.upsert:', profErr.message)
        return NEUTRAL
      }
    }

    const actionUrl = await buildWelcomeConfirmLink(email, 'magiclink', '/kunde')
    if (!actionUrl) return NEUTRAL
    const res = await sendLoginLink({ to: email, vorname: vorgaenge.leadVorname, actionUrl })
    if (!res.success) console.error('[login-kontakt] sendLoginLink:', res.error)
    return NEUTRAL
  } catch (err) {
    console.error('[login-kontakt] sendeAnmeldeLinkPerEmail:', err)
    return NEUTRAL
  }
}
