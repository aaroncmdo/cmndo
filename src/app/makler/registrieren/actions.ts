'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendMaklerWelcome } from '@/lib/email/google/flows'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-rate-limit'
import { anlegeMaklerKern } from '@/lib/makler/anlege-makler'

// Offener Self-Signup eines Maklers (Saeule B). Erzeugt SOFORT einen aktiven Makler +
// Promo-Code -> seine claimondo.de/m/[code]-Landeseite ist sofort live. KEIN Admin-Gate
// (Aaron-Entscheid 30.06.); Leitplanken = Validierung + Email-Dedupe + Rate-Limit +
// Deaktivierbarkeit (makler.status). Result-Object, kein throw. Keine rohen DB-Fehler an
// den oeffentlichen Client (M1-Muster aus sv-basic).

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function registriereMaklerSelf(
  formData: FormData,
): Promise<{ ok: true; code: string | null } | { ok: false; error: string }> {
  // 1. Parse + Validierung
  const firma = String(formData.get('firma') ?? '').trim()
  const vorname = String(formData.get('ansprechpartner_vorname') ?? '').trim()
  const nachname = String(formData.get('ansprechpartner_nachname') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const adressePlz = String(formData.get('adresse_plz') ?? '').trim() || null
  const adresseOrt = String(formData.get('adresse_ort') ?? '').trim() || null
  const einwilligung =
    formData.get('einwilligung') === 'on' || formData.get('einwilligung') === 'true'

  if (!firma) return { ok: false, error: 'Firmenname ist ein Pflichtfeld.' }
  if (!vorname || !nachname) {
    return { ok: false, error: 'Vor- und Nachname des Ansprechpartners sind Pflicht.' }
  }
  if (!EMAIL_RX.test(email)) {
    return { ok: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }
  }
  if (!telefon || telefon.length < 5) {
    return { ok: false, error: 'Telefonnummer ist ein Pflichtfeld.' }
  }
  if (!einwilligung) {
    return { ok: false, error: 'Bitte bestätigen Sie die Einwilligung, um fortzufahren.' }
  }

  // 2. Rate-Limit — fail-CLOSED (Account-Anlage ist sicherheitsrelevant)
  const rl = await checkIpRateLimit('makler-self-signup', { failClosed: true })
  if (!rl.allowed) return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }

  const admin = createAdminClient()

  // 3. Email-Dedupe: kein zweiter Account auf dieselbe Adresse
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'Zu dieser E-Mail existiert bereits ein Konto. Bitte melden Sie sich an.' }
  }

  // 4. Anlage (Auth + profiles[rolle=makler] + makler[status=aktiv] + Promo). aktiviertVon=null = Self-Signup.
  const result = await anlegeMaklerKern(admin, {
    firma,
    ansprechpartnerVorname: vorname,
    ansprechpartnerNachname: nachname,
    email,
    telefon,
    adresseStrasse: null,
    adressePlz,
    adresseOrt,
    provisionKomplett: 100,
    provisionGutachter: 50,
    aktiviertVon: null,
  })
  if (!result.ok) {
    // M1: keine rohen DB-Fehler an den oeffentlichen Client.
    console.error('[registriereMaklerSelf] Anlage fehlgeschlagen:', result.error)
    return {
      ok: false,
      error: 'Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
    }
  }

  // 5. Promo-Code lesen (Landeseiten-Slug fuer die Erfolgs-Anzeige)
  let code: string | null = null
  try {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('code')
      .eq('makler_id', result.maklerId)
      .eq('aktiv', true)
      .order('erstellt_am', { ascending: true })
      .limit(1)
      .maybeSingle()
    code = (pc?.code as string | null) ?? null
  } catch (err) {
    console.error('[registriereMaklerSelf] Promo-Read fehlgeschlagen (non-critical):', err)
  }

  // 6. Branded Welcome-Email — Kundennutzen-Framing + Empfehlungs-Landeseite + Recovery-
  //    Magic-Link zum Passwort-Setzen (non-critical). Konto ist bereits aktiv + Landeseite live.
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
    const landeseiteUrl = code ? `${base}/m/${code}` : base
    await sendMaklerWelcome({ to: email, firma, vorname, landeseiteUrl })
  } catch (err) {
    console.error('[registriereMaklerSelf] Welcome-Email fehlgeschlagen (non-critical):', err)
  }

  // 7. Awareness-Notification an Admins — KEIN Gate (offener Signup), nur Sichtbarkeit/
  //    Missbrauchs-Monitoring (Makler ist via makler.status='gesperrt' deaktivierbar).
  try {
    const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      await Promise.all(
        admins.map((a) =>
          admin.from('benachrichtigungen').insert({
            user_id: a.id as string,
            typ: 'makler_self_signup',
            titel: `Neuer Makler-Self-Signup: ${firma}`,
            beschreibung: `${firma} (${email}) hat sich selbst registriert. Promo-Code: ${code ?? '—'}.`,
            link: '/admin/makler',
          }),
        ),
      )
    }
  } catch (err) {
    console.error('[registriereMaklerSelf] Admin-Notify fehlgeschlagen (non-critical):', err)
  }

  return { ok: true, code }
}
