'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-rate-limit'
import { anlegePartnerKern } from '@/lib/partner/anlege-partner'
import { notifyTeamPartnerSignup } from '@/lib/partner/notify-team-signup'
import { sendWillkommenWerkstatt } from '@/lib/email/google/flows'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'

// Offener Self-Signup einer Werkstatt (CTA der werkstatt.claimondo.de-Landing).
// Erzeugt SOFORT eine aktive Werkstatt (status='aktiv') + Portal-Zugang (QR-Seite,
// Self-Print-Aufsteller, Vermittlungen) — Modell wie der Makler-Self-Signup:
// KEIN Admin-Gate; Leitplanken = Validierung + Email-Dedupe + Rate-Limit +
// Deaktivierbarkeit (werkstaetten.status='gesperrt'). Result-Object, kein throw.
// Keine rohen DB-Fehler an den oeffentlichen Client (M1-Muster).

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function registriereWerkstattSelf(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Parse + Validierung
  const firma = String(formData.get('firma') ?? '').trim()
  const vorname = String(formData.get('ansprechpartner_vorname') ?? '').trim()
  const nachname = String(formData.get('ansprechpartner_nachname') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const adresseStrasse = String(formData.get('adresse_strasse') ?? '').trim()
  const adressePlz = String(formData.get('adresse_plz') ?? '').trim()
  const adresseOrt = String(formData.get('adresse_ort') ?? '').trim()
  // Checkbox: nicht angehakt -> false (= regelbesteuert). Bewusst IMMER boolean (nie null),
  // damit partner-billing-ust die USt der Provisionsgutschriften sofort berechnen kann.
  const istKleinunternehmer =
    formData.get('kleinunternehmer') === 'true' || formData.get('kleinunternehmer') === 'on'
  const einwilligung =
    formData.get('einwilligung') === 'on' || formData.get('einwilligung') === 'true'
  // Netzwerk-Kalt-Einladung (optional): Token aus ?einladung=<token> in der Registrier-URL,
  // vom Client als Hidden-Field durchgereicht. Best-effort — bricht die Registrierung NIE.
  const einladungToken = String(formData.get('einladung') ?? '').trim()
  // Gewerke (optional, Mehrfachauswahl): gegen das kanonische Vokabular validieren + dedupen.
  // Leer = keine Angabe -> Feld bleibt weg (DB-Default), Matching rankt dann 'unbekannt'.
  const faehigkeiten = Array.from(
    new Set(
      formData
        .getAll('faehigkeiten')
        .map(String)
        .filter((f) => (GEWERKE as readonly string[]).includes(f)),
    ),
  )

  if (!firma) return { ok: false, error: 'Werkstatt-Name ist ein Pflichtfeld.' }
  if (!vorname || !nachname) {
    return { ok: false, error: 'Vor- und Nachname des Ansprechpartners sind Pflicht.' }
  }
  if (!EMAIL_RX.test(email)) {
    return { ok: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }
  }
  if (!telefon || telefon.length < 5) {
    return { ok: false, error: 'Telefonnummer ist ein Pflichtfeld.' }
  }
  if (!adresseStrasse) {
    return { ok: false, error: 'Straße und Hausnummer sind ein Pflichtfeld.' }
  }
  if (!adressePlz || !adresseOrt) {
    return { ok: false, error: 'PLZ und Ort sind Pflichtfelder.' }
  }
  if (!einwilligung) {
    return { ok: false, error: 'Bitte bestätigen Sie die Einwilligung, um fortzufahren.' }
  }

  // 2. Rate-Limit — fail-CLOSED (Account-Anlage ist sicherheitsrelevant)
  const rl = await checkIpRateLimit('werkstatt-self-signup', { failClosed: true })
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

  // 4. Geocoding — best-effort (Finder-Pin + Start-Karte), blockiert NICHT bei Fehler.
  let lat: number | null = null
  let lng: number | null = null
  try {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const geo = await geocodeAdresse(`${adresseStrasse}, ${adressePlz} ${adresseOrt}`)
    if (geo) {
      lat = geo.lat
      lng = geo.lng
    }
  } catch (err) {
    console.error('[registriereWerkstattSelf] Geocoding fehlgeschlagen (non-blocking):', err)
  }

  // 5. Anlage (Auth + profiles[rolle=werkstatt] + werkstaetten[status=aktiv] + Staffel).
  //    aktiviertVon=null = Self-Signup. Strasse + Kleinunternehmer via rollenDetails
  //    (additiv im Kern — Convert-Pfad unveraendert).
  const result = await anlegePartnerKern(admin, 'werkstatt', {
    firma,
    ansprechpartnerVorname: vorname,
    ansprechpartnerNachname: nachname,
    email,
    telefon,
    plz: adressePlz,
    ort: adresseOrt,
    lat,
    lng,
    aktiviertVon: null,
    rollenDetails: {
      adresse_strasse: adresseStrasse,
      ist_kleinunternehmer: istKleinunternehmer,
      quelle: 'self_signup',
      ...(faehigkeiten.length > 0 ? { faehigkeiten } : {}),
    },
  })
  if (!result.ok) {
    // M1: keine rohen DB-Fehler an den oeffentlichen Client.
    console.error('[registriereWerkstattSelf] Anlage fehlgeschlagen:', result.error)
    return {
      ok: false,
      error: 'Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
    }
  }

  // 5b. Onboarding-Drip enrollen (non-critical) — direkt nach dem status='aktiv'-Anlage-Erfolg.
  //     Idempotent (DB-UNIQUE werkstatt_id); ein Fehler hier darf die Registrierung nicht brechen.
  try {
    const { enrolleWerkstatt } = await import('@/lib/werkstatt-onboarding/enroll')
    await enrolleWerkstatt(admin, result.partnerId)
  } catch (e) {
    console.error('[enroll] werkstatt-onboarding', e)
  }

  // Netzwerk-Kalt-Einladung einloesen (best-effort — bricht die Registrierung nie): Auto-Kante zum Einlader.
  if (einladungToken) {
    try {
      const { loeseNetzwerkEinladungEin } = await import('@/lib/netzwerk/einladung')
      await loeseNetzwerkEinladungEin(admin, einladungToken, result.userId)
    } catch (err) {
      console.error('[registriereWerkstattSelf] Netzwerk-Einladung einloesen fehlgeschlagen (non-critical):', err)
    }
  }

  // 6. Willkommens-Mail mit Magic-Link zum Passwort-Setzen (non-critical — Konto ist aktiv;
  //    sendWillkommenWerkstatt wirft hart, wenn kein Link erzeugbar ist -> try/catch).
  try {
    await sendWillkommenWerkstatt({ to: email, werkstattName: firma })
  } catch (err) {
    console.error('[registriereWerkstattSelf] Willkommens-Mail fehlgeschlagen (non-critical):', err)
  }

  // 7. Awareness-Notification an Admins — KEIN Gate, nur Sichtbarkeit/Missbrauchs-Monitoring.
  try {
    const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      await Promise.all(
        admins.map((a) =>
          createNotification(
            a.id as string,
            'werkstatt_self_signup',
            `Neuer Werkstatt-Self-Signup: ${firma}`,
            `${firma} (${email}) hat sich selbst registriert. QR-Pool-Token kann bei Bedarf zugewiesen werden.`,
            '/admin/werkstaetten',
          ),
        ),
      )
    }
  } catch (err) {
    console.error('[registriereWerkstattSelf] Admin-Notify fehlgeschlagen (non-critical):', err)
  }

  // 8. Team-WhatsApp (wirft nie; interne/Test-Identitaeten unterdrueckt der Helper) —
  //    neue Marketing-Funnel-Partner sofort aufs Team-Handy (Aaron-Direktive 05.08.).
  await notifyTeamPartnerSignup({
    typ: 'werkstatt',
    art: 'registrierung',
    quelle: '/werkstatt/registrieren (Self-Signup)',
    firma,
    name: `${vorname} ${nachname}`,
    email,
    telefon,
    ort: `${adressePlz} ${adresseOrt}`,
    adminPfad: '/admin/werkstaetten',
  })

  return { ok: true }
}
