'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendMaklerWelcome } from '@/lib/email/google/flows'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-rate-limit'
import { anlegePartnerKern } from '@/lib/partner/anlege-partner'
import { notifyTeamPartnerSignup } from '@/lib/partner/notify-team-signup'
import { istErlaubteRechtsform } from '@/lib/rechtsformen'

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
  const versicherungId = String(formData.get('versicherung_id') ?? '').trim() || null
  const maklerpoolId = String(formData.get('maklerpool_id') ?? '').trim() || null
  const rechtsform = String(formData.get('rechtsform') ?? '').trim()
  // Netzwerk-Kalt-Einladung (optional): Token aus ?einladung= der Registrier-URL,
  // Redemption best-effort nach der Anlage (Muster werkstatt/registrieren).
  const einladungToken = String(formData.get('einladung') ?? '').trim()
  // Empfehlungsstruktur: optionaler Werber-Bezug aus dem Registrier-Link (?werber=<promo_code>).
  const werber = String(formData.get('werber') ?? '').trim() || null
  // Checkbox: nicht angehakt -> false (= regelbesteuert). Bewusst IMMER boolean (nie null),
  // damit partner-billing-ust die USt sofort berechnen kann (null = "unbekannt" blockiert).
  const istKleinunternehmer =
    formData.get('kleinunternehmer') === 'true' || formData.get('kleinunternehmer') === 'on'
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
  if (!rechtsform) {
    return { ok: false, error: 'Bitte wählen Sie Ihre Rechtsform.' }
  }
  if (!istErlaubteRechtsform(rechtsform)) {
    return { ok: false, error: 'Bitte wählen Sie eine gültige Rechtsform.' }
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

  // 3b. Werber-Auflösung: Promo-Code -> aktiver Sponsor-Makler -> dessen Sätze erben + sponsor setzen.
  //     Ungültiger/inaktiver Werber -> normaler offener Signup (kein Sponsor, Default 100/50).
  let sponsorMaklerId: string | null = null
  let provisionKomplett = 100
  let provisionGutachter = 50
  if (werber) {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('makler_id')
      .eq('code', werber)
      .eq('aktiv', true)
      .maybeSingle()
    if (pc?.makler_id) {
      const { data: sponsor } = await admin
        .from('makler')
        .select('id, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv, status')
        .eq('id', pc.makler_id)
        .maybeSingle()
      if (sponsor && sponsor.provision_aktiv && sponsor.status === 'aktiv') {
        sponsorMaklerId = sponsor.id as string
        provisionKomplett = Number(sponsor.provision_betrag_komplett_netto ?? 100)
        provisionGutachter = Number(sponsor.provision_betrag_nur_gutachter_netto ?? 50)
      }
    }
  }

  // 4. Anlage (Auth + profiles[rolle=makler] + makler[status=aktiv] + Promo + Staffel + Phone-Login).
  //    EIN Anlage-Kern fuer alle Partner-Rollen (anlegePartnerKern) — der frueher separate
  //    anlegeMaklerKern war ein Spiegel davon und ist aufgeloest. aktiviertVon=null = Self-Signup.
  const result = await anlegePartnerKern(admin, 'makler', {
    firma,
    ansprechpartnerVorname: vorname,
    ansprechpartnerNachname: nachname,
    email,
    telefon,
    plz: adressePlz,
    ort: adresseOrt,
    aktiviertVon: null,
    rollenDetails: {
      provision_betrag_komplett_netto: provisionKomplett,
      provision_betrag_nur_gutachter_netto: provisionGutachter,
      versicherung_id: versicherungId,
      maklerpool_id: maklerpoolId,
      rechtsform,
      ist_kleinunternehmer: istKleinunternehmer,
      sponsor_makler_id: sponsorMaklerId,
    },
  })
  if (!result.ok) {
    // M1: keine rohen DB-Fehler an den oeffentlichen Client.
    console.error('[registriereMaklerSelf] Anlage fehlgeschlagen:', result.error)
    return {
      ok: false,
      error: 'Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
    }
  }

  // 4b. Netzwerk-Kalt-Einladung einloesen (Auto-Kante zum Einlader) — best-effort,
  // bricht die Registrierung NIE.
  if (einladungToken) {
    try {
      const { loeseNetzwerkEinladungEin } = await import('@/lib/netzwerk/einladung')
      await loeseNetzwerkEinladungEin(admin, einladungToken, result.userId)
    } catch (err) {
      console.error('[registriereMaklerSelf] netzwerk-einladung redemption (non-critical):', err)
    }
  }

  // 5. Promo-Code lesen (Landeseiten-Slug fuer die Erfolgs-Anzeige)
  let code: string | null = null
  try {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('code')
      .eq('makler_id', result.partnerId)
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
          createNotification(
            a.id as string,
            'makler_self_signup',
            `Neuer Makler-Self-Signup: ${firma}`,
            `${firma} (${email}) hat sich selbst registriert. Promo-Code: ${code ?? '—'}.`,
            '/admin/makler',
          ),
        ),
      )
    }
  } catch (err) {
    console.error('[registriereMaklerSelf] Admin-Notify fehlgeschlagen (non-critical):', err)
  }

  // 8. Team-WhatsApp (wirft nie; interne/Test-Identitaeten unterdrueckt der Helper) —
  //    neue Marketing-Funnel-Partner sofort aufs Team-Handy (Aaron-Direktive 05.08.).
  await notifyTeamPartnerSignup({
    typ: 'makler',
    art: 'registrierung',
    quelle: '/makler/registrieren (Self-Signup)',
    firma,
    name: `${vorname} ${nachname}`,
    email,
    telefon,
    ort: [adressePlz, adresseOrt].filter(Boolean).join(' ') || null,
    adminPfad: '/admin/makler',
    extraFields: [{ label: 'Promo-Code', value: code }],
  })

  return { ok: true, code }
}
