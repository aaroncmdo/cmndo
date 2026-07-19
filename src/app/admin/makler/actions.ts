'use server'

// Makler-Vermittlung: Admin-Anlage eines Maklers. Kern-Anlage (Auth-User + profiles +
// makler-Row + Promo-Code) via konsolidiertem anlegePartnerKern; makler-spezifische
// Felder (dual-rate Provision, Gesellschaft, Strasse) laufen ueber rollenDetails.
// Form-Parsing + Welcome-Mail bleiben hier (Caller-Verantwortung, wie im Kern dokumentiert).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendMaklerWelcome } from '@/lib/email/google/flows'
import { anlegePartnerKern } from '@/lib/partner/anlege-partner'
import { istErlaubteRechtsform } from '@/lib/rechtsformen'

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

export async function createMakler(
  formData: FormData,
): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Makler anlegen.' }

  const firma = String(formData.get('firma') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  // ansprechpartner_vorname/nachname sind in makler NOT NULL -> nie null setzen.
  const ansprechpartner_vorname = String(formData.get('ansprechpartner_vorname') ?? '').trim()
  const ansprechpartner_nachname = String(formData.get('ansprechpartner_nachname') ?? '').trim()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const adresse_strasse = String(formData.get('adresse_strasse') ?? '').trim() || null
  const adresse_plz = String(formData.get('adresse_plz') ?? '').trim() || null
  const adresse_ort = String(formData.get('adresse_ort') ?? '').trim() || null
  const provKomplett = Number(formData.get('provision_betrag_komplett_netto') ?? 100) || 100
  const provGutachter = Number(formData.get('provision_betrag_nur_gutachter_netto') ?? 50) || 50
  // Makler-Gesellschaft: versicherungsgebunden (versicherung_id) ODER frei (maklerpool_id).
  const versicherung_id = String(formData.get('versicherung_id') ?? '').trim() || null
  const maklerpool_id = String(formData.get('maklerpool_id') ?? '').trim() || null
  // AAR-empfehlung: Rechtsform Pflicht (Abrechnung) + Kleinunternehmer-Flag.
  const rechtsform = String(formData.get('rechtsform') ?? '').trim()
  const istKleinunternehmer =
    formData.get('kleinunternehmer') === 'on' || formData.get('kleinunternehmer') === 'true'

  if (!firma || !email || !ansprechpartner_vorname || !ansprechpartner_nachname) {
    return { ok: false, error: 'Firma, E-Mail und Ansprechpartner (Vor- und Nachname) sind Pflicht.' }
  }
  if (!rechtsform || !istErlaubteRechtsform(rechtsform)) {
    return { ok: false, error: 'Bitte wählen Sie eine gültige Rechtsform.' }
  }

  // Kern-Anlage via konsolidiertem anlegePartnerKern (Auth-User + profiles + makler-Row +
  // Promo-Code + Rollback-Cascade). Makler-spezifische Felder laufen ueber rollenDetails;
  // anlegePartnerKern setzt sie nur wenn vorhanden (dual-rate Provision liefern wir immer).
  const admin = createAdminClient()
  const result = await anlegePartnerKern(admin, 'makler', {
    firma,
    ansprechpartnerVorname: ansprechpartner_vorname,
    ansprechpartnerNachname: ansprechpartner_nachname,
    email,
    telefon,
    plz: adresse_plz,
    ort: adresse_ort,
    aktiviertVon: adminUser.id,
    rollenDetails: {
      adresse_strasse,
      provision_betrag_komplett_netto: provKomplett,
      provision_betrag_nur_gutachter_netto: provGutachter,
      versicherung_id,
      maklerpool_id,
      rechtsform,
      ist_kleinunternehmer: istKleinunternehmer,
    },
  })
  if (!result.ok) return { ok: false, error: result.error }

  // Willkommens-/Login-Email (best-effort, non-critical) — analog zum Self-Signup:
  // Empfehlungs-Landeseite + Recovery-Magic-Link. Promo-Code aus der DB nachladen
  // (anlegePartnerKern legt genau einen an). Das Passwort bleibt Admin-Fallback im Ergebnis.
  try {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('code')
      .eq('makler_id', result.partnerId)
      .limit(1)
      .maybeSingle()
    const code = (pc?.code as string | undefined) ?? null
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
    const landeseiteUrl = code ? `${base}/m/${code}` : base
    await sendMaklerWelcome({ to: email, firma, vorname: ansprechpartner_vorname, landeseiteUrl })
  } catch (err) {
    console.error('[createMakler] Welcome-Email fehlgeschlagen (non-critical):', err)
  }

  revalidatePath('/admin/makler')
  return { ok: true, email, password: result.password }
}

// Admin sendet einem bestehenden Makler die Login-/Willkommens-Mail (erneut). Deckt den Fall
// ab, dass die Mail bei der Anlage/Selbst-Registrierung nicht ankam (z.B. interne/Test-Adresse
// von der Send-Isolation unterdrueckt). Anders als bei createMakler ist der Mail-Versand hier
// der Zweck der Aktion -> ein Fehler wird als Result zurueckgegeben (nicht verschluckt).
export async function resendMaklerWelcome(
  maklerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Login-Mails senden.' }

  const admin = createAdminClient()
  const { data: m } = await admin
    .from('makler')
    .select('firma, email, ansprechpartner_vorname')
    .eq('id', maklerId)
    .maybeSingle()
  if (!m || !m.email) {
    return { ok: false, error: 'Makler nicht gefunden oder ohne E-Mail-Adresse.' }
  }

  // Promo-Code fuer die Empfehlungs-Landeseite nachladen (non-fatal wie in createMakler).
  const { data: pc } = await admin
    .from('promotion_codes')
    .select('code')
    .eq('makler_id', maklerId)
    .limit(1)
    .maybeSingle()
  const code = (pc?.code as string | undefined) ?? null
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const landeseiteUrl = code ? `${base}/m/${code}` : base

  // Admin-getriggerte 1:1-Transaktionsmail -> Send-Isolations-Ausnahme (allowInternalRecipient),
  // damit die Login-Mail auch an interne/Test-Adressen zugestellt wird. SIDE_EFFECT-Dry-Run bleibt aktiv.
  try {
    await sendMaklerWelcome(
      {
        to: m.email,
        firma: (m.firma as string | null) ?? '',
        vorname: (m.ansprechpartner_vorname as string | null) ?? '',
        landeseiteUrl,
      },
      { allowInternalRecipient: true },
    )
  } catch (err) {
    console.error('[resendMaklerWelcome] Login-Mail fehlgeschlagen:', err)
    return { ok: false, error: 'Die Login-Mail konnte nicht gesendet werden.' }
  }

  revalidatePath('/admin/makler')
  return { ok: true }
}
