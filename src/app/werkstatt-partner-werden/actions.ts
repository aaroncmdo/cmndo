'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-rate-limit'
import { geocodePartnerLead } from '@/lib/partner/geocode-partner-lead'
import { notifyTeamPartnerSignup } from '@/lib/partner/notify-team-signup'

// Oeffentlicher Inbound-Antrag "Werkstatt Partner werden" (Slice D). Erzeugt einen
// partner_leads-Prospect (rolle=werkstatt, status=neu, source_channel=marketing_bewerbung),
// den das Vertriebs-Team unter /admin/partner-leads reviewt/konvertiert. Werkstaetten
// legen KEINEN Account selbst an (Policy self_signup=false — admin+QR bleibt der Weg);
// dies traegt nur INTERESSE ein.
//
// KEINE Auth (public). Der Insert laeuft ueber den Admin-Client (service_role), weil
// partner_leads RLS-only-Staff ist und es keine anon-INSERT-Policy gibt. Leitplanken =
// Validierung (Firma + Email Pflicht) + IP-Rate-Limit (fail-CLOSED) + keine rohen
// DB-Fehler an den oeffentlichen Client (M1-Muster). Result-Object, kein throw
// (AGENTS §Server-Actions).

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function werkstattPartnerAnfrage(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Parse + Validierung
  const firma = String(formData.get('firma') ?? '').trim()
  const vorname = String(formData.get('ansprechpartner_vorname') ?? '').trim()
  const nachname = String(formData.get('ansprechpartner_nachname') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const plz = String(formData.get('plz') ?? '').trim() || null
  const ort = String(formData.get('ort') ?? '').trim() || null
  const marken = String(formData.get('marken') ?? '').trim() || null
  const nachricht = String(formData.get('nachricht') ?? '').trim() || null

  if (!firma) return { ok: false, error: 'Firmenname ist ein Pflichtfeld.' }
  if (!EMAIL_RX.test(email)) {
    return { ok: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }
  }

  // 2. Rate-Limit — fail-CLOSED (oeffentlicher Insert, Missbrauchs-Schutz).
  const rl = await checkIpRateLimit('werkstatt-partner-anfrage', { failClosed: true })
  if (!rl.allowed) return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }

  const admin = createAdminClient()

  // 3. Prospect anlegen. rollen_details haelt die freien Zusatzfelder (Marken/Nachricht),
  //    die es in partner_leads nicht als eigene Spalte gibt — sie werden im Detail-Drawer
  //    des Vertriebsdashboards angezeigt.
  const rollenDetails: Record<string, unknown> = {}
  if (marken) rollenDetails.marken = marken
  if (nachricht) rollenDetails.nachricht = nachricht

  // Geocoding (best-effort): oeffentliche Bewerbung nie wegen Geocode-Fehler ablehnen.
  let geoFields: { lat?: number; lng?: number; google_place_id?: string | null } = {}
  try {
    const geo = await geocodePartnerLead({ plz, ort })
    if (geo.ok) {
      geoFields = { lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id }
    }
  } catch (geoErr) {
    console.error('[werkstattPartnerAnfrage] Geocoding fehlgeschlagen (non-critical):', geoErr)
  }

  const { error } = await admin.from('partner_leads').insert({
    rolle: 'werkstatt',
    status: 'neu',
    source_channel: 'marketing_bewerbung',
    firma,
    ansprechpartner_vorname: vorname || null,
    ansprechpartner_nachname: nachname || null,
    email,
    telefon,
    plz,
    ort,
    rollen_details: rollenDetails,
    ...geoFields,
  })
  if (error) {
    // M1: keine rohen DB-Fehler an den oeffentlichen Client.
    console.error('[werkstattPartnerAnfrage] Insert fehlgeschlagen:', error.message)
    return {
      ok: false,
      error: 'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
    }
  }

  // 4. Awareness-Notification an Admins — nur Sichtbarkeit fuers Vertriebs-Team,
  //    kein Gate. Non-critical: ein Notify-Fehler bricht die Anfrage nicht.
  try {
    const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      await Promise.all(
        admins.map((a) =>
          admin.from('benachrichtigungen').insert({
            user_id: a.id as string,
            typ: 'werkstatt_partner_anfrage',
            titel: `Neue Werkstatt-Anfrage: ${firma}`,
            beschreibung: `${firma} (${email}) möchte Werkstatt-Partner werden.`,
            link: '/admin/partner-leads',
          }),
        ),
      )
    }
  } catch (err) {
    console.error('[werkstattPartnerAnfrage] Admin-Notify fehlgeschlagen (non-critical):', err)
  }

  // 5. Team-WhatsApp (wirft nie; interne/Test-Identitaeten unterdrueckt der Helper) —
  //    neue Marketing-Funnel-Partner sofort aufs Team-Handy (Aaron-Direktive 05.08.).
  await notifyTeamPartnerSignup({
    typ: 'werkstatt',
    art: 'anfrage',
    quelle: '/werkstatt-partner-werden (Marketing-Formular)',
    firma,
    name: [vorname, nachname].filter(Boolean).join(' ') || null,
    email,
    telefon,
    ort: [plz, ort].filter(Boolean).join(' ') || null,
    adminPfad: '/admin/partner-leads',
    extraFields: [
      { label: 'Marken', value: marken },
      { label: 'Nachricht', value: nachricht ? nachricht.slice(0, 200) : null },
    ],
  })

  return { ok: true }
}
